from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage
from langgraph.graph import END, START, MessagesState, StateGraph

from app.core.config import settings


def build_agent(md_content: str, checkpointer):
    llm = ChatAnthropic(model=settings.ANTHROPIC_MODEL, api_key=settings.ANTHROPIC_API_KEY)

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
