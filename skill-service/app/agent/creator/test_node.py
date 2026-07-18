import time

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langgraph.checkpoint.memory import MemorySaver
from pydantic import BaseModel, Field

from app.agent.graph import build_agent
from app.core.config import settings

from .loader import load_prompt
from .merges import merge_test_report
from .outputs import SkillTestOutput
from .render import render_md_content
from .state import CreatorState

BASELINE_PROMPT = (
    "당신은 일반적인 도움을 주는 어시스턴트입니다. "
    "특정 분야의 전문 지식이나 노하우 없이, 일반 상식 수준에서만 답하세요."
)


class ProposedQuestions(BaseModel):
    """샘플 질문이 확정됐을 때(자동 제안 + 사용자 추가분을 합쳐 더 없다고 확인됐을 때) 호출."""

    questions: list[str] = Field(description="실제로 돌려볼 확정된 질문 목록")


def make_skill_test_node():
    """04 skill_test 전용 노드 — 나머지 4개와 달리 stage_runner.make_stage_node()로 못 만든다.
    '실제로 돌려본다' 단계는 LLM 한 번 호출이 아니라, 지금까지의 content로 임시 스킬 에이전트를
    띄우고 baseline(스킬 없는) 에이전트와 나란히 돌려본 뒤, 그 결과를 다시 LLM에게 채점시키는
    2단계 오케스트레이션이라 별도 구현이 필요하다."""

    llm = ChatAnthropic(model=settings.ANTHROPIC_MODEL, api_key=settings.ANTHROPIC_API_KEY)
    propose_llm = llm.bind_tools([ProposedQuestions])
    grade_llm = llm.bind_tools([SkillTestOutput])

    async def node(state: CreatorState) -> dict:
        skill_info = state["skill_info"]
        system = SystemMessage(content=load_prompt("04-skill-test.md", skill_info))

        response = await propose_llm.ainvoke([system] + state["messages"])
        tool_calls = getattr(response, "tool_calls", None)
        if not tool_calls:
            return {"messages": [response]}  # 아직 질문 뽑는 중, 대화 계속

        questions: list[str] = tool_calls[0]["args"]["questions"]
        md_content = render_md_content(skill_info)

        transcript_lines = [
            "다음은 확정된 테스트 질문과, 실제 스킬 에이전트 / baseline(스킬 없는 일반 어시스턴트) "
            "답변, 그리고 실측 성능치입니다. 이걸 근거로 test_report 형식의 진단을 만들어주세요."
        ]
        total_tokens = 0
        total_seconds = 0.0

        for i, question in enumerate(questions):
            skill_agent = build_agent(md_content, MemorySaver())
            baseline_agent = build_agent(BASELINE_PROMPT, MemorySaver())
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

        grade_response = await grade_llm.ainvoke([system, HumanMessage(content="\n".join(transcript_lines))])
        grade_calls = getattr(grade_response, "tool_calls", None)
        if not grade_calls:
            return {"messages": [response, propose_result, grade_response]}

        grade_result = ToolMessage(content="ok", tool_call_id=grade_calls[0]["id"])
        updated_info = merge_test_report(skill_info, grade_calls[0]["args"])
        return {
            "messages": [response, propose_result, grade_response, grade_result],
            "skill_info": updated_info,
        }

    return node
