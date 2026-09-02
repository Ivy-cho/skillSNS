import logging
import time

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langgraph.checkpoint.memory import MemorySaver
from pydantic import BaseModel, Field, ValidationError

from app.agent.graph import build_agent
from app.core.config import settings

from .loader import load_prompt
from .merges import merge_test_report
from .outputs import DiagnosisItem, SampleQuestion, SkillTestOutput
from .render import render_md_content
from .state import CreatorState
from .text import extract_text

logger = logging.getLogger(__name__)

BASELINE_PROMPT = (
    "당신은 일반적인 도움을 주는 어시스턴트입니다. "
    "특정 분야의 전문 지식이나 노하우 없이, 일반 상식 수준에서만 답하세요."
)

# 채점 LLM에게 "다시, 이번엔 빠짐없이" 요구할 때 붙이는 지침.
REGRADE_INSTRUCTION = (
    "직전 SkillTestOutput 호출에 빠진 항목이 있습니다. sampleQuestions, diagnosis, "
    "benchmark(passRate·time·aiCost 세 개 모두), analystNotes를 전부 채워서 "
    "SkillTestOutput을 한 번만 다시 호출하세요."
)


def _cost_level(total_tokens: int) -> str:
    if total_tokens < 4_000:
        return "적음"
    if total_tokens < 12_000:
        return "보통"
    return "많음"


def _report_is_complete(args: dict) -> bool:
    """LLM이 준 tool_call 인자가 화면이 기대하는 형태를 다 갖췄는지(빠른 검사)."""
    if not isinstance(args, dict):
        return False
    bench = args.get("benchmark") or {}
    return (
        bool(args.get("sampleQuestions"))
        and bool(args.get("diagnosis"))
        and bool(args.get("analystNotes"))
        and all(k in bench for k in ("passRate", "time", "aiCost"))
    )


def _ensure_complete_report(args: dict, avg_seconds: float, total_tokens: int) -> dict:
    """test_report를 항상 test_report.schema.json / SkillTestOutput 형태로 보장한다.
    LLM이 일부 필드를 빠뜨려도(관측된 실패: benchmark.passRate 누락 → 프론트 크래시)
    실측치·중립값으로 메운 뒤 Pydantic으로 최종 검증한 dict를 돌려준다."""
    data = dict(args or {})

    bench = dict(data.get("benchmark") or {})
    bench.setdefault(
        "passRate",
        {
            "withSkill": 0.0,
            "withoutSkill": 0.0,
            "help": "이번 테스트에서는 통과율을 산출하지 못했습니다.",
        },
    )
    bench.setdefault(
        "time",
        {"seconds": avg_seconds, "help": "스킬을 켰을 때의 평균 응답 시간(실측)."},
    )
    bench.setdefault(
        "aiCost",
        {
            "level": _cost_level(total_tokens),
            "help": f"이번 테스트에 쓴 총 토큰 약 {total_tokens} 기준(실측).",
        },
    )
    data["benchmark"] = bench
    data.setdefault("sampleQuestions", [])
    data.setdefault("diagnosis", [])
    data.setdefault("analystNotes", [])

    try:
        return SkillTestOutput.model_validate(data).model_dump()
    except ValidationError:
        logger.warning("test_report 검증 실패 — 유효하지 않은 항목을 정리해 재구성", exc_info=True)

    def _keep_valid(model, items):
        out = []
        for item in items or []:
            try:
                out.append(model.model_validate(item).model_dump())
            except ValidationError:
                pass
        return out

    data["sampleQuestions"] = _keep_valid(SampleQuestion, data.get("sampleQuestions"))
    data["diagnosis"] = _keep_valid(DiagnosisItem, data.get("diagnosis"))
    data["analystNotes"] = [str(n) for n in (data.get("analystNotes") or []) if n]
    return SkillTestOutput.model_validate(data).model_dump()


class ProposedQuestions(BaseModel):
    """샘플 질문이 확정됐을 때(자동 제안 + 사용자 추가분을 합쳐 더 없다고 확인됐을 때) 호출."""

    questions: list[str] = Field(description="실제로 돌려볼 확정된 질문 목록")


def make_skill_test_node(api_key: str):
    """04 skill_test 전용 노드 — 나머지 4개와 달리 stage_runner.make_stage_node()로 못 만든다.
    '실제로 돌려본다' 단계는 LLM 한 번 호출이 아니라, 지금까지의 content로 임시 스킬 에이전트를
    띄우고 baseline(스킬 없는) 에이전트와 나란히 돌려본 뒤, 그 결과를 다시 LLM에게 채점시키는
    2단계 오케스트레이션이라 별도 구현이 필요하다."""

    llm = ChatAnthropic(model=settings.ANTHROPIC_MODEL, api_key=api_key)
    propose_llm = llm.bind_tools([ProposedQuestions])
    grade_llm = llm.bind_tools([SkillTestOutput])

    async def node(state: CreatorState) -> dict:
        skill_info = state["skill_info"]
        system = SystemMessage(content=load_prompt("04-skill-test.md", skill_info))

        response = await propose_llm.ainvoke([system] + state["messages"])
        tool_calls = getattr(response, "tool_calls", None)
        if not tool_calls:
            # 아직 질문 뽑는 중, 대화 계속
            return {
                "messages": [response],
                "turn_messages": [extract_text(response.content)],
                "choices": None,
                "summary": False,
            }

        questions: list[str] = tool_calls[0]["args"]["questions"]
        md_content = render_md_content(skill_info)

        transcript_lines = [
            "다음은 확정된 테스트 질문과, 실제 스킬 에이전트 / baseline(스킬 없는 일반 어시스턴트) "
            "답변, 그리고 실측 성능치입니다. 이걸 근거로 test_report 형식의 진단을 만들어주세요."
        ]
        total_tokens = 0
        total_seconds = 0.0

        for i, question in enumerate(questions):
            skill_agent = build_agent(md_content, MemorySaver(), api_key)
            baseline_agent = build_agent(BASELINE_PROMPT, MemorySaver(), api_key)
            skill_cfg = {"configurable": {"thread_id": f"test-skill-{i}"}}
            base_cfg = {"configurable": {"thread_id": f"test-base-{i}"}}

            started = time.monotonic()
            skill_result = await skill_agent.ainvoke({"messages": [HumanMessage(content=question)]}, skill_cfg)
            total_seconds += time.monotonic() - started
            baseline_result = await baseline_agent.ainvoke({"messages": [HumanMessage(content=question)]}, base_cfg)

            skill_msg = skill_result["messages"][-1]
            baseline_msg = baseline_result["messages"][-1]
            for msg in (skill_msg, baseline_msg):
                usage = getattr(msg, "usage_metadata", None) or {}
                total_tokens += usage.get("total_tokens", 0)

            transcript_lines.append(
                f"\n## 질문 {i + 1}\n{question}\n"
                f"**스킬 켰을 때:** {skill_msg.content}\n"
                f"**스킬 껐을 때(baseline):** {baseline_msg.content}"
            )

        avg_seconds = round(total_seconds / max(len(questions), 1), 1)
        transcript_lines.append(
            f"\n## 실측치\n평균 응답 시간(스킬 켰을 때): {avg_seconds}초 / 총 토큰 사용량(추정): {total_tokens}"
        )

        # propose_llm의 tool_use(questions 확정)에도 더미 tool_result를 붙여둔다 — 안 붙이면
        # 이 노드가 반환하는 messages가 이후 다른 노드의 히스토리에 재사용될 때 Anthropic이 거부한다.
        propose_result = ToolMessage(content="ok", tool_call_id=tool_calls[0]["id"])

        transcript = "\n".join(transcript_lines)
        grade_response = await grade_llm.ainvoke([system, HumanMessage(content=transcript)])
        grade_calls = getattr(grade_response, "tool_calls", None)

        # 리포트가 불완전하게 오면(관측된 실패: benchmark.passRate 누락) 한 번만 다시 요청한다.
        # 실패한 첫 응답은 messages에 남기지 않는다 — tool_use/tool_result 짝이 안 맞아 이후 히스토리
        # 재사용 시 Anthropic이 거부하기 때문. 재시도도 불완전하면 아래 _ensure_complete_report가 메운다.
        if grade_calls and not _report_is_complete(grade_calls[0]["args"]):
            regraded = await grade_llm.ainvoke(
                [system, HumanMessage(content=transcript), HumanMessage(content=REGRADE_INSTRUCTION)]
            )
            if getattr(regraded, "tool_calls", None):
                grade_response, grade_calls = regraded, regraded.tool_calls

        turn_messages = [extract_text(response.content), extract_text(grade_response.content)]
        if not grade_calls:
            return {
                "messages": [response, propose_result, grade_response],
                "turn_messages": turn_messages,
                "choices": None,
                "summary": False,
            }

        grade_result = ToolMessage(content="ok", tool_call_id=grade_calls[0]["id"])
        report = _ensure_complete_report(grade_calls[0]["args"], avg_seconds, total_tokens)
        updated_info = merge_test_report(skill_info, report)
        return {
            "messages": [response, propose_result, grade_response, grade_result],
            "skill_info": updated_info,
            "turn_messages": turn_messages,
            "choices": None,
            "summary": False,
        }

    return node
