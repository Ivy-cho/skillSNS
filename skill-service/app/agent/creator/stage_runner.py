from typing import Callable, Optional, Type

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, ToolMessage
from langgraph.graph import END
from pydantic import BaseModel

from app.core.config import settings

from .loader import load_prompt
from .state import CreatorState


def make_stage_node(
    prompt_file: str,
    output_model: Type[BaseModel],
    merge: Callable[[dict, dict], dict],
    next_stage: Optional[str],
):
    """5개 단계 노드가 전부 공유하는 유일한 실행기.

    prompt_file: app/prompts/skill_creation/ 안의 .md 파일명
    output_model: 이 단계가 끝났을 때 호출할 tool의 Pydantic 스키마
    merge: (skill_info, tool_call_args) -> 갱신된 skill_info. 이 단계가 skill_info의
           어떤 필드를 채우는지는 여기서만 결정된다.
    next_stage: 이 단계가 끝나면 같은 턴 안에서 바로 이어서 진행할 다음 노드 이름.
        01→02→03은 이 값이 있어 자동으로 이어지고, 04/05는 None이라 완료돼도 여기서 멈춘다
        (결과를 본 사용자가 다음 행동을 직접 고르기 때문 — 그 전환은 그래프가 아니라
        API 라우트가 SkillDraft.stage를 바꿔서 처리한다).
    """
    llm = ChatAnthropic(model=settings.ANTHROPIC_MODEL, api_key=settings.ANTHROPIC_API_KEY)
    llm_with_tool = llm.bind_tools([output_model])

    async def node(state: CreatorState) -> dict:
        system = SystemMessage(content=load_prompt(prompt_file, state["skill_info"]))
        response = await llm_with_tool.ainvoke([system] + state["messages"])

        tool_calls = getattr(response, "tool_calls", None)
        if not tool_calls:
            return {"messages": [response]}

        updated_info = merge(state["skill_info"], tool_calls[0]["args"])
        # Anthropic API는 tool_use 블록 바로 다음에 대응하는 tool_result가 없으면 그 이후 어떤
        # 호출에도 이 히스토리를 재사용할 수 없다(400 에러). 이 tool_call은 실제 도구 실행이 아니라
        # 구조화된 출력 용도라 진짜 실행 결과는 없지만, 형식을 맞추기 위해 더미 tool_result를 붙인다.
        tool_result = ToolMessage(content="ok", tool_call_id=tool_calls[0]["id"])
        result = {"messages": [response, tool_result], "skill_info": updated_info}
        if next_stage:
            result["stage"] = next_stage
        return result

    return node


def make_router(next_stage: Optional[str]):
    """make_stage_node는 완료 시(tool_call 발생 + next_stage 있음) state['stage']를 next_stage로
    직접 바꿔놓는다. 그러니 라우팅도 메시지 모양을 다시 훑는 대신 그 결과(state['stage'])만 보면
    된다 — tool_call 메시지 바로 뒤에 더미 tool_result가 붙어 있어서 state['messages'][-1]로
    tool_call 여부를 판단하면 항상 어긋난다(마지막 메시지가 tool_result가 되므로)."""

    def route(state: CreatorState):
        if next_stage and state.get("stage") == next_stage:
            return next_stage
        return END

    return route
