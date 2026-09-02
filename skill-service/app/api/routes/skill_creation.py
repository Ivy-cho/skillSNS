import binascii
import logging
import uuid
from base64 import b64decode
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from langchain_core.messages import HumanMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.category_classifier import classify_category
from app.agent.creator import build_creator_graph
from app.agent.creator.render import render_md_content
from app.core.security import decode_token
from app.db.database import get_db
from app.models.skill import Skill, SkillDraft
from app.schemas.creation import CreationResponse
from app.schemas.skill import SkillSummary
from app.services.categories import get_fallback_category_id, resolve_display
from app.services.ingest import IngestError, fetch_url_text, ingest_file
from app.services.user_secrets import require_llm_key, resolve_llm_key

router = APIRouter(prefix="/skills/create", tags=["skill-creation"])
bearer_scheme = HTTPBearer()
logger = logging.getLogger(__name__)

# 단계 진행 순서 + 각 단계가 skill_info에 채우는 필드. revert 시 "이 단계로 되돌아간다"는
# 그 단계 자신이 채우는 필드부터 그 뒤 단계가 채운 필드까지 전부 폐기한다는 뜻이다.
# (category는 skill_name 확정 시 카테고리명 Agent가 정하므로, skill_name 이하로 되돌아가면 함께
#  폐기해 다시 정하게 한다 — 아래 _skill_info_before_stage 참고.)
STAGE_ORDER = ["what_skill", "skill_content", "skill_name", "skill_test", "skill_improve"]
STAGE_FIELDS = {
    "what_skill": ("topic", "definition", "target"),
    "skill_content": ("content",),
    "skill_name": ("name",),
    "skill_test": ("testReport",),
    "skill_improve": ("content",),
}
# skill_improve는 "앞으로 가는" 분기라 되돌아갈 대상으로는 안 받는다(핸드오프 계약과 동일).
REVERTIBLE_STAGES = ("what_skill", "skill_content", "skill_name", "skill_test")


def _skill_info_before_stage(skill_info: dict, target_stage: str) -> dict:
    idx = STAGE_ORDER.index(target_stage)
    discard = {field for stage in STAGE_ORDER[idx:] for field in STAGE_FIELDS[stage]}
    # 카테고리는 skill_name 확정 시 정해지므로, skill_name 이하로 되돌아가면 다시 정하도록 폐기한다.
    if idx <= STAGE_ORDER.index("skill_name"):
        discard.add("category")
    return {k: v for k, v in skill_info.items() if k not in discard}


def _get_user_id(credentials: HTTPAuthorizationCredentials) -> str:
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")
    return payload["sub"]


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


async def _classify(skill_info: dict, api_key: str, db: AsyncSession) -> str:
    """카테고리명 Agent로 skill_info를 분류해 소분류 id를 얻는다."""
    return await classify_category(
        render_md_content(skill_info),
        api_key,
        db,
        topic=skill_info.get("topic", "") or "",
        definition=skill_info.get("definition", "") or "",
        target=skill_info.get("target", "") or "",
    )


async def _ensure_category(draft: SkillDraft, api_key: str, db: AsyncSession) -> str:
    """draft를 카테고리명 Agent로 분류해 skill_info["category"](소분류 id)를 채우고 그 id를 돌려준다.
    이름 확정 시점(_invoke)과 confirm 안전망이 공용으로 쓴다."""
    sub_id = await _classify(draft.skill_info, api_key, db)
    draft.skill_info = {**draft.skill_info, "category": sub_id}
    return sub_id


async def _invoke(
    request: Request,
    db: AsyncSession,
    draft: SkillDraft,
    human_message: Optional[str],
    api_key: str,
) -> CreationResponse:
    agent = build_creator_graph(request.app.state.checkpointer, api_key)
    config = {"configurable": {"thread_id": draft.thread_id}}

    # Anthropic API는 system만 있고 messages가 비어있으면 400을 낸다. 카테고리 선택 직후처럼
    # 아직 사용자 메시지가 없는 시점(진입 문구만 필요한 상황)에도 최소 1개는 채워 보낸다.
    input_messages = [HumanMessage(content=human_message or "(진행)")]
    prev_stage = draft.stage
    result_state = await agent.ainvoke(
        {"messages": input_messages, "skill_info": draft.skill_info, "stage": draft.stage}, config
    )

    draft.skill_info = result_state["skill_info"]
    draft.stage = result_state["stage"]
    await db.commit()  # stage 전진을 먼저 확정 — 뒤이은 분류 실패가 이 커밋을 오염시키지 못하게 격리
    await db.refresh(draft)

    # 이름이 방금 확정됐으면(skill_name -> skill_test) 카테고리명 Agent가 대/소분류를 정해
    # skill_info["category"]에 소분류 id를 채운다. best-effort라, 실패하면 롤백하고 넘어가
    # confirm에서 다시 시도한다(그때도 실패하면 '미분류'로 저장).
    if prev_stage == "skill_name" and draft.stage == "skill_test" and not draft.skill_info.get("category"):
        try:
            await _ensure_category(draft, api_key, db)
            await db.commit()
        except Exception:
            await db.rollback()
            logger.exception("카테고리 분류 실패 (draft_id=%s) — confirm 시 재시도", draft.id)

    return CreationResponse(
        draft_id=draft.id,
        stage=draft.stage,
        messages=result_state.get("turn_messages", []),
        skill_info=draft.skill_info,
        choices=result_state.get("choices"),
        summary=bool(result_state.get("summary", False)),
    )


@router.post("", response_model=CreationResponse)
async def start_draft(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    user_id = _get_user_id(credentials)
    api_key = await require_llm_key(user_id, db)
    # 카테고리는 더 이상 시작 시 사용자가 고르지 않는다 — 이름 단계에서 카테고리명 Agent가 정한다.
    draft = SkillDraft(
        user_id=user_id,
        thread_id=str(uuid.uuid4()),
        stage="what_skill",
        skill_info={},
    )
    db.add(draft)
    await db.commit()
    await db.refresh(draft)
    return await _invoke(request, db, draft, human_message=None, api_key=api_key)


@router.post("/{draft_id}", response_model=CreationResponse)
async def continue_draft(
    draft_id: str,
    request: Request,
    message: str = Form(""),
    # message에 HTML 태그·쉘 명령이 잔뜩이면 Cloudflare WAF가 요청을 403(Blocked)으로 끊는다
    # (→ 브라우저엔 "Failed to fetch"). 프론트가 그런 message를 base64로 감싸 보낼 때 "base64"로 온다.
    message_encoding: str = Form(""),
    links: list[str] = Form([]),
    files: list[UploadFile] = File([]),
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    user_id = _get_user_id(credentials)
    draft = await _load_draft(draft_id, user_id, db)

    if message_encoding == "base64" and message:
        try:
            message = b64decode(message, validate=True).decode("utf-8")
        except (binascii.Error, ValueError) as e:
            raise HTTPException(status_code=422, detail="INVALID_MESSAGE_ENCODING") from e

    combined = await _combine_sources(message, links, files)
    if not combined:
        raise HTTPException(status_code=422, detail="EMPTY_REQUEST")

    # 무료 체험 카운트는 실제로 LLM을 부르기 직전에만 소모한다.
    api_key = await require_llm_key(user_id, db)
    return await _invoke(request, db, draft, human_message=combined, api_key=api_key)


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

    # 무료 체험 카운트는 실제로 LLM을 부르기 직전에만 소모한다.
    api_key = await require_llm_key(user_id, db)
    draft.stage = "skill_improve"
    await db.commit()
    await db.refresh(draft)
    return await _invoke(request, db, draft, human_message=None, api_key=api_key)


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

    # 무료 체험 카운트는 실제로 LLM을 부르기 직전에만 소모한다.
    api_key = await require_llm_key(user_id, db)
    draft.stage = "skill_test"
    await db.commit()
    await db.refresh(draft)
    return await _invoke(
        request,
        db,
        draft,
        human_message="(재테스트 시작) 개선된 내용을 반영해서 테스트를 처음부터 다시 진행해주세요.",
        api_key=api_key,
    )


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

    # 카테고리(소분류 id)는 이름 단계에서 정해지지만, 그때 실패했을 수 있으니 없으면 여기서 한 번 더 정한다.
    # 카테고리(소분류 id)는 이름 단계에서 정해지지만 실패했을 수 있다. 없으면 여기서 한 번 더
    # 시도하되, 또 실패하거나 키가 없어도 사용자의 완성된 스킬은 '미분류'로라도 반드시 저장한다.
    category_id = draft.skill_info.get("category")
    if not category_id:
        api_key = await resolve_llm_key(user_id, db)
        if api_key:
            try:
                category_id = await _ensure_category(draft, api_key, db)
            except Exception:
                await db.rollback()
                logger.exception("confirm 카테고리 분류 실패 — 미분류로 저장 (draft_id=%s)", draft.id)
        if not category_id:
            category_id = await get_fallback_category_id(db)

    skill = Skill(
        user_id=user_id,
        title=name,
        description=draft.skill_info.get("definition"),
        md_content=render_md_content(draft.skill_info),
        category=category_id,
    )
    db.add(skill)
    draft.confirmed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(skill)
    cat_name, cat_emoji = await resolve_display(db, skill.category)
    return SkillSummary.build(skill, cat_name, cat_emoji)


@router.post("/{draft_id}/revert", response_model=CreationResponse)
async def revert_draft(
    draft_id: str,
    request: Request,
    stage: str = Form(...),
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    """"이 단계부터 수정" — 지정 stage 이후로 쌓인 skill_info/대화를 폐기하고 그 단계를
    다시 시작한다. 이후 단계의 대화가 새 stage의 프롬프트/skill_info와 어긋나지 않도록,
    이어쓰는 대신 새 thread_id로 아예 새로 시작한다(start_draft와 동일한 방식)."""
    user_id = _get_user_id(credentials)
    draft = await _load_draft(draft_id, user_id, db)

    if stage not in REVERTIBLE_STAGES:
        raise HTTPException(status_code=422, detail="INVALID_STAGE")
    if draft.confirmed_at is not None:
        raise HTTPException(status_code=409, detail="DRAFT_ALREADY_CONFIRMED")

    # 무료 체험 카운트는 실제로 LLM을 부르기 직전에만 소모한다.
    api_key = await require_llm_key(user_id, db)
    draft.skill_info = _skill_info_before_stage(draft.skill_info, stage)
    draft.stage = stage
    draft.thread_id = str(uuid.uuid4())
    await db.commit()
    await db.refresh(draft)

    return await _invoke(request, db, draft, human_message=None, api_key=api_key)
