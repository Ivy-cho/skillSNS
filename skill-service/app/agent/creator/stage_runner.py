from typing import Callable, Optional, Type

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, ToolMessage
from pydantic import BaseModel

from app.core.config import settings

from .loader import load_prompt
from .state import CreatorState
from .text import extract_text


def make_stage_node(
    prompt_file: str,
    output_model: Type[BaseModel],
    merge: Callable[[dict, dict], dict],
    next_stage: Optional[str],
    api_key: str,
):
    """what_skill/skill_content/skill_improve 3개 노드가 공유하는 실행기 (skill_name은
    choices/summary가 필요해 name_node.py로 따로 만든다).

    prompt_file: app/prompts/skill_creation/ 안의 .md 파일명
    output_model: 이 단계가 끝났을 때 호출할 tool의 Pydantic 스키마
    merge: (skill_info, tool_call_args) -> 갱신된 skill_info. 이 단계가 skill_info의
           어떤 필드를 채우는지는 여기서만 결정된다.
    next_stage: done=true일 때 state["stage"]에 기록할 다음 단계 이름. 호출 하나 = 단계
        하나만 처리하고 매번 여기서 끝난다 — 다음 단계로 넘어갈지는 클라이언트가 다음
        요청을 보낼 때 결정한다.
    """
    llm = ChatAnthropic(model=settings.ANTHROPIC_MODEL, api_key=api_key)
    llm_with_tool = llm.bind_tools([output_model])

    async def node(state: CreatorState) -> dict:
        system = SystemMessage(content=load_prompt(prompt_file, state["skill_info"]))
        response = await llm_with_tool.ainvoke([system] + state["messages"])

        tool_calls = getattr(response, "tool_calls", None)
        if not tool_calls:
            return {
                "messages": [response],
                "turn_messages": [extract_text(response.content)],
                "choices": None,
                "summary": False,
            }

        updated_info = merge(state["skill_info"], tool_calls[0]["args"])
        # Anthropic API는 tool_use 블록 바로 다음에 대응하는 tool_result가 없으면 그 이후 어떤
        # 호출에도 이 히스토리를 재사용할 수 없다(400 에러). 이 tool_call은 실제 도구 실행이 아니라
        # 구조화된 출력 용도라 진짜 실행 결과는 없지만, 형식을 맞추기 위해 더미 tool_result를 붙인다.
        tool_result = ToolMessage(content="ok", tool_call_id=tool_calls[0]["id"])
        result = {
            "messages": [response, tool_result],
            "skill_info": updated_info,
            "turn_messages": [extract_text(response.content)],
            "choices": None,
            "summary": False,
        }
        if next_stage:
            result["stage"] = next_stage
        return result

    return node
