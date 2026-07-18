import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from langchain_core.messages import AIMessage, HumanMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.creator import build_creator_graph
from app.agent.creator.render import render_md_content
from app.core.security import decode_token
from app.db.database import get_db
from app.models.skill import Skill, SkillDraft
from app.schemas.creation import CreationResponse
from app.schemas.skill import SkillSummary
from app.services.ingest import IngestError, fetch_url_text, ingest_file

router = APIRouter(prefix="/skills/create", tags=["skill-creation"])
bearer_scheme = HTTPBearer()


def _get_user_id(credentials: HTTPAuthorizationCredentials) -> str:
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")
    return payload["sub"]


def _extract_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
            elif isinstance(block, str):
                parts.append(block)
        return "\n".join(parts)
    return str(content) if content else ""


async def _combine_sources(message: str, links: list[str], files: list[UploadFile]) -> str:
    parts = []
    if message and message.strip():
        parts.append(message.strip())

    for url in links:
        url = url.strip()
        if not url:
            continue
        try:
            text = await fetch_url_text(url)
            parts.append(f"[출처 URL: {url}]\n{text}")
        except IngestError as e:
            parts.append(f"[출처 URL: {url}]\n(가져오기 실패: {e})")

    for f in files:
        data = await f.read()
        try:
            text = await ingest_file(f.filename or "", data)
            parts.append(f"[출처 파일: {f.filename}]\n{text}")
        except IngestError as e:
            parts.append(f"[출처 파일: {f.filename}]\n(처리 실패: {e})")

    return "\n\n---\n\n".join(parts)


async def _load_draft(draft_id: str, user_id: str, db: AsyncSession) -> SkillDraft:
    result = await db.execute(select(SkillDraft).where(SkillDraft.id == draft_id))
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="DRAFT_NOT_FOUND")
    if draft.user_id != user_id:
        raise HTTPException(status_code=403, detail="FORBIDDEN")
    return draft


async def _invoke(
    request: Request, db: AsyncSession, draft: SkillDraft, human_message: Optional[str]
) -> CreationResponse:
    agent = build_creator_graph(request.app.state.checkpointer)
    config = {"configurable": {"thread_id": draft.thread_id}}

    before_state = await agent.aget_state(config)
    before_count = len(before_state.values.get("messages", [])) if before_state and before_state.values else 0

    # Anthropic API는 system만 있고 messages가 비어있으면 400을 낸다. 카테고리 선택 직후처럼
    # 아직 사용자 메시지가 없는 시점(진입 문구만 필요한 상황)에도 최소 1개는 채워 보낸다.
    input_messages = [HumanMessage(content=human_message or "(진행)")]
    result_state = await agent.ainvoke(
        {"messages": input_messages, "skill_info": draft.skill_info, "stage": draft.stage}, config
    )

    draft.skill_info = result_state["skill_info"]
    draft.stage = result_state["stage"]
    await db.commit()
    await db.refresh(draft)

    new_messages = result_state["messages"][before_count + len(input_messages) :]
    replies = [_extract_text(m.content) for m in new_messages if isinstance(m, AIMessage)]

    return CreationResponse(draft_id=draft.id, stage=draft.stage, messages=replies, skill_info=draft.skill_info)


@router.post("", response_model=CreationResponse)
async def start_draft(
    request: Request,
    category: str = Form(...),
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    user_id = _get_user_id(credentials)
    draft = SkillDraft(
        user_id=user_id,
        thread_id=str(uuid.uuid4()),
        stage="what_skill",
        skill_info={"category": category},
    )
    db.add(draft)
    await db.commit()
    await db.refresh(draft)
    return await _invoke(request, db, draft, human_message=None)


@router.post("/{draft_id}", response_model=CreationResponse)
async def continue_draft(
    draft_id: str,
    request: Request,
    message: str = Form(""),
    links: list[str] = Form([]),
    files: list[UploadFile] = File([]),
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    user_id = _get_user_id(credentials)
    draft = await _load_draft(draft_id, user_id, db)

    combined = await _combine_sources(message, links, files)
    if not combined:
        raise HTTPException(status_code=422, detail="EMPTY_REQUEST")

    return await _invoke(request, db, draft, human_message=combined)


@router.post("/{draft_id}/improve", response_model=CreationResponse)
async def improve_draft(
    draft_id: str,
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    """04(skill_test) 결과를 보고 사용자가 "개선할게요"를 눌렀을 때."""
    user_id = _get_user_id(credentials)
    draft = await _load_draft(draft_id, user_id, db)
    if draft.stage != "skill_test" or not draft.skill_info.get("testReport"):
        raise HTTPException(status_code=409, detail="NOT_READY_TO_IMPROVE")

    draft.stage = "skill_improve"
    await db.commit()
    await db.refresh(draft)
    return await _invoke(request, db, draft, human_message=None)


@router.post("/{draft_id}/retest", response_model=CreationResponse)
async def retest_draft(
    draft_id: str,
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    """05(skill_improve) 이후 사용자가 "다시 테스트"를 눌렀을 때."""
    user_id = _get_user_id(credentials)
    draft = await _load_draft(draft_id, user_id, db)
    if draft.stage != "skill_improve":
        raise HTTPException(status_code=409, detail="NOT_READY_TO_RETEST")

    draft.stage = "skill_test"
    await db.commit()
    await db.refresh(draft)
    return await _invoke(request, db, draft, human_message=None)


@router.get("/{draft_id}", response_model=CreationResponse)
async def get_draft(
    draft_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    user_id = _get_user_id(credentials)
    draft = await _load_draft(draft_id, user_id, db)
    return CreationResponse(draft_id=draft.id, stage=draft.stage, messages=[], skill_info=draft.skill_info)


@router.post("/{draft_id}/confirm", response_model=SkillSummary, status_code=201)
async def confirm_draft(
    draft_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    user_id = _get_user_id(credentials)
    draft = await _load_draft(draft_id, user_id, db)

    name = draft.skill_info.get("name")
    content = draft.skill_info.get("content")
    if not name or not content:
        raise HTTPException(status_code=400, detail="DRAFT_NOT_READY")

    skill = Skill(
        user_id=user_id,
        title=name,
        description=draft.skill_info.get("definition"),
        md_content=render_md_content(draft.skill_info),
    )
    db.add(skill)
    await db.commit()
    await db.refresh(skill)
    return skill
