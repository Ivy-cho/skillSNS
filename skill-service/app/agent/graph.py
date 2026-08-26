from typing import Optional

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage
from langgraph.graph import END, START, MessagesState, StateGraph

from app.core.config import settings

# 대화의 첫 턴(오프닝)에서만 덧붙는 지침 — 사용자가 아직 아무 말도 안 한 채로 호출되는
# 턴이라, 스킬 소개 없이 바로 "무엇을 도와드릴까요"만 묻던 문제를 여기서 없앤다.
OPENING_INSTRUCTIONS = (
    "\n\n---\n[첫 턴 안내]\n지금은 이 대화의 첫 턴이고, 사용자는 아직 아무 말도 하지 "
    "않았다. 이번 사용자 메시지는 형식을 맞추기 위한 더미이니 내용은 무시하고, 아래 "
    "순서로 딱 한 번에 답한다:\n"
    "1. 위 지식을 가진 전문가로서 스스로를 1~2문장으로 소개한다 — 무엇을 도와줄 수 있는 "
    "전문가인지 사용자가 바로 알 수 있게 구체적으로 말한다. \"무엇을 도와드릴까요?\" 처럼 "
    "정체를 안 밝히고 되묻지 않는다.\n"
    "2. 소개가 끝나면 곧바로, 이 스킬이 사용자를 돕기 위해 가장 먼저 물어야 할 질문을 "
    "하나만 자연스럽게 이어서 묻는다(여러 개 나열 금지).\n"
    "사용자 답을 기다리지 말고, 이 한 번의 응답 안에서 소개와 첫 질문을 모두 마친다."
)


def build_agent(md_content: str, checkpointer, api_key: Optional[str] = None, opening: bool = False):
    # api_key를 아예 안 넘기면(예: 대화 기록만 읽고 LLM은 안 부르는 호출) langchain이 서버
    # 기본 ANTHROPIC_API_KEY 환경변수로 폴백한다 — api_key=None을 명시적으로 넘기면 그
    # 폴백이 안 먹고 오히려 pydantic 검증 에러가 난다.
    kwargs = {"api_key": api_key} if api_key else {}
    llm = ChatAnthropic(model=settings.ANTHROPIC_MODEL, **kwargs)

    async def call_model(state: MessagesState):
        content = f"당신은 다음 전문 지식을 가진 전문가입니다. 이 지식을 바탕으로 사용자의 질문에 답하세요:\n\n{md_content}"
        if opening:
            content += OPENING_INSTRUCTIONS
        system = SystemMessage(content=content)
        response = await llm.ainvoke([system] + state["messages"])
        return {"messages": [response]}

    builder = StateGraph(MessagesState)
    builder.add_node("agent", call_model)
    builder.add_edge(START, "agent")
    builder.add_edge("agent", END)
    return builder.compile(checkpointer=checkpointer)
