from typing import Optional

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage
from langgraph.graph import END, START, MessagesState, StateGraph

from app.core.config import settings


def build_agent(md_content: str, checkpointer, api_key: Optional[str] = None):
    # api_key를 아예 안 넘기면(예: 대화 기록만 읽고 LLM은 안 부르는 호출) langchain이 서버
    # 기본 ANTHROPIC_API_KEY 환경변수로 폴백한다 — api_key=None을 명시적으로 넘기면 그
    # 폴백이 안 먹고 오히려 pydantic 검증 에러가 난다.
    kwargs = {"api_key": api_key} if api_key else {}
    llm = ChatAnthropic(model=settings.ANTHROPIC_MODEL, **kwargs)

    async def call_model(state: MessagesState):
        system = SystemMessage(
            content=f"당신은 다음 전문 지식을 가진 전문가입니다. 이 지식을 바탕으로 사용자의 질문에 답하세요:\n\n{md_content}"
        )
        response = await llm.ainvoke([system] + state["messages"])
        return {"messages": [response]}

    builder = StateGraph(MessagesState)
    builder.add_node("agent", call_model)
    builder.add_edge(START, "agent")
    builder.add_edge("agent", END)
    return builder.compile(checkpointer=checkpointer)
