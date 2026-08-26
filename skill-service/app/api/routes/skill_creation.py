import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from langchain_core.messages import HumanMessage
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
from app.services.user_secrets import resolve_llm_key

router = APIRouter(prefix="/skills/create", tags=["skill-creation"])
bearer_scheme = HTTPBearer()

# 단계 진행 순서 + 각 단계가 skill_info에 채우는 필드. revert 시 "이 단계로 되돌아간다"는
# 그 단계 자신이 채우는 필드부터 그 뒤 단계가 채운 필드까지 전부 폐기한다는 뜻이다
# (category만 어느 단계에도 안 묶여 있어서 항상 남는다).
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
    return {k: v for k, v in skill_info.items() if k not in discard}


def _get_user_id(credentials: HTTPAuthorizationCredentials) -> str:
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")
    return payload["sub"]


# 스킬 만들기는 첫 호출부터 끝까지 전부 LLM 호출이라, 로그인처럼 "안내만 반환"할 여지가
# 없다 — 본인 키가 없으면 무료 체험 한도(계정당 평생 3회, 생성·대화 합산) 안에서만
# 서버 기본 키를 내주고, 그마저 다 썼으면 바로 막는다(resolve_llm_key 참고).
async def _require_anthropic_key(user_id: str, db: AsyncSession) -> str:
    api_key = await resolve_llm_key(user_id, db)
    if not api_key:
        raise HTTPException(status_code=400, detail="ANTHROPIC_KEY_REQUIRED")
    return api_key


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
    result_state = await agent.ainvoke(
        {"messages": input_messages, "skill_info": draft.skill_info, "stage": draft.stage}, config
    )

    draft.skill_info = result_state["skill_info"]
    draft.stage = result_state["stage"]
    await db.commit()
    await db.refresh(draft)

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
    category: str = Form(...),
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    user_id = _get_user_id(credentials)
    api_key = await _require_anthropic_key(user_id, db)
    draft = SkillDraft(
        user_id=user_id,
        thread_id=str(uuid.uuid4()),
        stage="what_skill",
        skill_info={"category": category},
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

    # 무료 체험 카운트는 실제로 LLM을 부르기 직전에만 소모한다.
    api_key = await _require_anthropic_key(user_id, db)
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
    api_key = await _require_anthropic_key(user_id, db)
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
    api_key = await _require_anthropic_key(user_id, db)
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

    skill = Skill(
        user_id=user_id,
        title=name,
        description=draft.skill_info.get("definition"),
        md_content=render_md_content(draft.skill_info),
        category=draft.skill_info.get("category") or "미분류",
    )
    db.add(skill)
    draft.confirmed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(skill)
    return skill


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
    api_key = await _require_anthropic_key(user_id, db)
    draft.skill_info = _skill_info_before_stage(draft.skill_info, stage)
    draft.stage = stage
    draft.thread_id = str(uuid.uuid4())
    await db.commit()
    await db.refresh(draft)

    return await _invoke(request, db, draft, human_message=None, api_key=api_key)
