from typing import Optional

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, ToolMessage

from app.core.config import settings

from .loader import load_prompt
from .merges import merge_name
from .outputs import NameTurn
from .state import CreatorState
from .text import extract_text

# .md 원본은 안 건드리고 코드에서 이 지침만 이어붙인다. 강제 tool-call이 아니라 "이럴 때만
# 이 tool을 써라"는 선택 기준을 알려주는 것 — 나머지 3단계(stage_runner.py)와 같은 선택적
# tool-call 메커니즘이고, skill_name만 스키마가 reply/done/choices/summary/name으로 더 풍부하다.
INTEGRATION_INSTRUCTIONS = """
---
[연동 지침]
이름 후보를 제시하거나(choices), 확정된 이름을 보여주고 확인받거나(summary),
이름이 최종 확정됐을 때(done)는 반드시 도구 호출로 응답한다. 그 외 평범한 대화 턴은
지금처럼 자유롭게 텍스트로 답해도 된다.
- 도구를 쓸 때 reply는 짧게 — 후보 목록은 choices로 넘기고 reply에 다시 나열하지 않는다.
- choices: 이름 후보를 제안하는 턴이면 채운다(보통 3개, 문구만, 순위·이유 설명 금지).
- summary: 사용자가 고르거나 직접 이름을 말해서 확정 직전 확인받는 순간이면 true.
- done: 사용자가 확인해 이름이 최종 확정됐으면 true. 이 턴에만 name을 채운다.
"""


def make_name_node(next_stage: Optional[str], api_key: str):
    llm = ChatAnthropic(model=settings.ANTHROPIC_MODEL, api_key=api_key)
    llm_with_tool = llm.bind_tools([NameTurn])

    async def node(state: CreatorState) -> dict:
        prompt = load_prompt("03-skill-name.md", state["skill_info"])
        system = SystemMessage(content=prompt + INTEGRATION_INSTRUCTIONS)
        response = await llm_with_tool.ainvoke([system] + state["messages"])

        tool_calls = getattr(response, "tool_calls", None)
        if not tool_calls:
            return {
                "messages": [response],
                "turn_messages": [extract_text(response.content)],
                "choices": None,
                "summary": False,
            }

        args = tool_calls[0]["args"]
        tool_result = ToolMessage(content="ok", tool_call_id=tool_calls[0]["id"])
        updated_info = merge_name(state["skill_info"], args)

        result = {
            "messages": [response, tool_result],
            "skill_info": updated_info,
            "turn_messages": [args.get("reply") or extract_text(response.content)],
            "choices": args.get("choices"),
            "summary": bool(args.get("summary", False)),
        }
        if args.get("done") and next_stage:
            result["stage"] = next_stage
        return result

    return node
