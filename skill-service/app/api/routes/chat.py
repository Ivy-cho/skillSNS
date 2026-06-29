import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from langchain_core.messages import AIMessage, HumanMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.graph import build_agent
from app.core.security import decode_token
from app.db.database import get_db
from app.models.skill import ChatSession, Skill
from app.schemas.skill import ChatHistoryResponse, ChatRequest, ChatResponse, MessageItem

router = APIRouter(prefix="/chat", tags=["chat"])
bearer_scheme = HTTPBearer(auto_error=False)

UNAUTHENTICATED_REPLY = "전문가와 대화하려면 로그인이 필요합니다."


def _get_user_id(credentials: Optional[HTTPAuthorizationCredentials]) -> Optional[str]:
    if not credentials:
        return None
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        return None
    return payload.get("sub")


@router.post("/{skill_id}", response_model=ChatResponse)
async def start_chat(
    skill_id: str,
    body: ChatRequest,
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    user_id = _get_user_id(credentials)
    if not user_id:
        return ChatResponse(session_id=None, reply=UNAUTHENTICATED_REPLY)

    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="SKILL_NOT_FOUND")

    thread_id = str(uuid.uuid4())
    session = ChatSession(user_id=user_id, skill_id=skill_id, thread_id=thread_id)
    db.add(session)
    await db.commit()
    await db.refresh(session)

    agent = build_agent(skill.md_content, request.app.state.checkpointer)
    config = {"configurable": {"thread_id": thread_id}}
    result_state = await agent.ainvoke({"messages": [HumanMessage(content=body.message)]}, config)
    reply = result_state["messages"][-1].content

    return ChatResponse(session_id=session.id, reply=reply)


@router.post("/{skill_id}/{session_id}", response_model=ChatResponse)
async def continue_chat(
    skill_id: str,
    session_id: str,
    body: ChatRequest,
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    user_id = _get_user_id(credentials)
    if not user_id:
        return ChatResponse(session_id=None, reply=UNAUTHENTICATED_REPLY)

    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="SKILL_NOT_FOUND")

    session_result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id, ChatSession.skill_id == skill_id
        )
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="SESSION_NOT_FOUND")
    if session.user_id != user_id:
        raise HTTPException(status_code=403, detail="FORBIDDEN")

    agent = build_agent(skill.md_content, request.app.state.checkpointer)
    config = {"configurable": {"thread_id": session.thread_id}}
    result_state = await agent.ainvoke({"messages": [HumanMessage(content=body.message)]}, config)
    reply = result_state["messages"][-1].content

    return ChatResponse(session_id=session.id, reply=reply)


@router.get("/{skill_id}/{session_id}", response_model=ChatHistoryResponse)
async def get_chat_history(
    skill_id: str,
    session_id: str,
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    user_id = _get_user_id(credentials)
    if not user_id:
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")

    session_result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id, ChatSession.skill_id == skill_id
        )
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="SESSION_NOT_FOUND")
    if session.user_id != user_id:
        raise HTTPException(status_code=403, detail="FORBIDDEN")

    agent = build_agent("", request.app.state.checkpointer)
    config = {"configurable": {"thread_id": session.thread_id}}
    state = await agent.aget_state(config)

    messages = []
    if state and state.values.get("messages"):
        for msg in state.values["messages"]:
            if isinstance(msg, HumanMessage):
                messages.append(MessageItem(role="user", content=msg.content))
            elif isinstance(msg, AIMessage):
                messages.append(MessageItem(role="assistant", content=msg.content))

    return ChatHistoryResponse(session_id=session_id, skill_id=skill_id, messages=messages)
