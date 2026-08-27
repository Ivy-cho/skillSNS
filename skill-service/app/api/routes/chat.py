import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from langchain_core.messages import AIMessage, HumanMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.graph import build_agent
from app.core.config import settings
from app.core.security import decode_token
from app.db.database import get_db
from app.models.skill import ChatSession, Skill
from app.schemas.skill import (
    ChatHistoryResponse,
    ChatRequest,
    ChatResponse,
    ChatSessionSummary,
    MessageItem,
)
from app.services.categories import DEFAULT_CATEGORY_EMOJI, get_display_map
from app.services.user_secrets import resolve_llm_key

router = APIRouter(prefix="/chat", tags=["chat"])
bearer_scheme = HTTPBearer(auto_error=False)

UNAUTHENTICATED_REPLY = "전문가와 대화하려면 로그인이 필요합니다."
# 무료 체험(계정당 평생 3회, 생성·대화 합산) 다 쓴 뒤에나 뜨는 안내 — resolve_llm_key 참고.
NO_API_KEY_REPLY = "무료로 대화할 수 있는 횟수를 다 썼어요. 계속하려면 프로필에서 본인 Anthropic API 키를 등록해주세요."


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

    # message가 없으면(채팅창을 막 연 시점) 오프닝 턴 — 스킬이 스스로 소개하고 첫 질문을
    # 바로 던진다. 이건 실제 대화가 아니라 메뉴판을 보여주는 것에 가까워서 무료 체험
    # 횟수도 안 깎고 본인 키도 요구하지 않는다 — 항상 서버 기본 키로 공짜다. 진짜
    # 체험/키 소모는 사용자가 첫 메시지를 실제로 보낼 때(continue_chat)부터 시작된다.
    is_opening = not (body.message and body.message.strip())
    if is_opening:
        api_key = settings.ANTHROPIC_API_KEY
    else:
        # 무료 체험 카운트는 실제로 LLM을 부르기 직전에만 소모한다 — 스킬을 찾지 못해
        # 실패할 요청까지 무료 횟수를 깎으면 안 된다.
        api_key = await resolve_llm_key(user_id, db)
        if not api_key:
            return ChatResponse(session_id=None, reply=NO_API_KEY_REPLY)

    thread_id = str(uuid.uuid4())
    session = ChatSession(user_id=user_id, skill_id=skill_id, thread_id=thread_id)
    db.add(session)
    await db.commit()
    await db.refresh(session)

    agent = build_agent(skill.md_content, request.app.state.checkpointer, api_key, opening=is_opening)
    config = {"configurable": {"thread_id": thread_id}}
    human_content = body.message.strip() if not is_opening else "(대화 시작)"
    result_state = await agent.ainvoke({"messages": [HumanMessage(content=human_content)]}, config)
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
    if not body.message or not body.message.strip():
        raise HTTPException(status_code=422, detail="EMPTY_REQUEST")

    # 무료 체험 카운트는 실제로 LLM을 부르기 직전에만 소모한다 — 위 검증에서
    # 실패할 요청까지 무료 횟수를 깎으면 안 된다.
    api_key = await resolve_llm_key(user_id, db)
    if not api_key:
        return ChatResponse(session_id=None, reply=NO_API_KEY_REPLY)

    agent = build_agent(skill.md_content, request.app.state.checkpointer, api_key)
    config = {"configurable": {"thread_id": session.thread_id}}
    result_state = await agent.ainvoke({"messages": [HumanMessage(content=body.message)]}, config)
    reply = result_state["messages"][-1].content

    # 채팅 목록을 최근 대화순으로 보여주기 위한 정렬 기준 갱신.
    session.updated_at = datetime.now(timezone.utc)
    await db.commit()

    return ChatResponse(session_id=session.id, reply=reply)


@router.get("/sessions", response_model=list[ChatSessionSummary])
async def list_chat_sessions(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    """'내가 어떤 스킬과 대화했는지' 목록 — 채팅 목록 화면(/chats)이 쓴다."""
    user_id = _get_user_id(credentials)
    if not user_id:
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")

    result = await db.execute(
        select(ChatSession, Skill.title, Skill.category)
        .join(Skill, Skill.id == ChatSession.skill_id)
        .where(ChatSession.user_id == user_id)
        .order_by(ChatSession.updated_at.desc())
    )
    rows = result.all()
    disp = await get_display_map(db, [category for _, _, category in rows])

    summaries = []
    for session, skill_title, category in rows:
        # 실제 메시지 본문은 이 테이블이 아니라 LangGraph 체크포인터에 있다 —
        # get_chat_history와 동일한 방식으로 마지막 메시지만 꺼내온다.
        agent = build_agent("", request.app.state.checkpointer)
        config = {"configurable": {"thread_id": session.thread_id}}
        state = await agent.aget_state(config)
        last_message = ""
        if state and state.values.get("messages"):
            last_message = state.values["messages"][-1].content

        cat_name, cat_emoji = disp.get(category, (category, DEFAULT_CATEGORY_EMOJI))
        summaries.append(
            ChatSessionSummary(
                skill_id=session.skill_id,
                skill_title=skill_title,
                category=cat_name,
                category_emoji=cat_emoji,
                session_id=session.id,
                last_message=last_message,
                last_message_at=session.updated_at,
            )
        )

    return summaries


@router.get("/{skill_id}/latest", response_model=Optional[ChatHistoryResponse])
async def get_latest_chat_session(
    skill_id: str,
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    """이 스킬에서 나눈 가장 최근 대화 — 채팅창 진입 시 이어보기용.
    대화 이력이 없으면 새 대화를 시작할 수 있도록 null을 돌려준다."""
    user_id = _get_user_id(credentials)
    if not user_id:
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")

    session_result = await db.execute(
        select(ChatSession)
        .where(ChatSession.skill_id == skill_id, ChatSession.user_id == user_id)
        .order_by(ChatSession.updated_at.desc())
        .limit(1)
    )
    session = session_result.scalar_one_or_none()
    if not session:
        return None

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

    return ChatHistoryResponse(session_id=session.id, skill_id=skill_id, messages=messages)


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
