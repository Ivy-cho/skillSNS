import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.category_classifier import classify_category
from app.core.security import decode_token
from app.db.database import AsyncSessionLocal, get_db
from app.models.skill import Skill
from app.schemas.skill import MessageResponse, SkillCreate, SkillDetail, SkillSummary, SkillUpdate
from app.services.categories import (
    DEFAULT_CATEGORY_EMOJI,
    get_display_map,
    get_fallback_category_id,
    resolve_display,
)
from app.services.user_secrets import resolve_llm_key

router = APIRouter(prefix="/skills", tags=["skills"])
bearer_scheme = HTTPBearer()
logger = logging.getLogger(__name__)


@router.post("", response_model=SkillSummary, status_code=201)
async def create_skill(
    body: SkillCreate,
    background_tasks: BackgroundTasks,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")

    user_id = payload["sub"]
    # 저장은 즉시 끝낸다 — 카테고리는 일단 '미분류'로 넣고, 자동 분류(LLM 호출)는 응답을 보낸 뒤
    # 백그라운드에서 채운다. 저장 요청이 느린 LLM 호출에 묶여 타임아웃/실패하지 않게 하기 위해서다.
    category_id = await get_fallback_category_id(db)
    skill = Skill(
        user_id=user_id,
        title=body.title,
        description=body.description,
        md_content=body.md_content,
        category=category_id,
    )
    db.add(skill)
    await db.commit()
    await db.refresh(skill)

    background_tasks.add_task(
        _categorize_skill_in_background, skill.id, user_id, body.md_content, body.description or ""
    )

    name, emoji = await resolve_display(db, skill.category)
    return SkillSummary.build(skill, name, emoji)


async def _categorize_skill_in_background(
    skill_id: str, user_id: str, md_content: str, description: str
) -> None:
    """create_skill이 응답을 보낸 뒤 실행 — 카테고리명 Agent로 분류해 skills.category를 갱신한다.
    실패해도 스킬은 이미 '미분류'로 저장돼 있어 유실되지 않는다(요청 경로와 분리된 별도 세션)."""
    async with AsyncSessionLocal() as db:
        try:
            api_key = await resolve_llm_key(user_id, db)
            if not api_key:
                return
            category_id = await classify_category(md_content, api_key, db, definition=description)
            await db.execute(update(Skill).where(Skill.id == skill_id).values(category=category_id))
            await db.commit()
        except Exception:
            logger.exception("백그라운드 카테고리 분류 실패 (skill_id=%s)", skill_id)


@router.get("", response_model=list[SkillSummary])
async def list_skills(
    user_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Skill)
    if user_id:
        stmt = stmt.where(Skill.user_id == user_id)
    result = await db.execute(stmt.order_by(Skill.created_at.desc()))
    skills = result.scalars().all()
    disp = await get_display_map(db, [s.category for s in skills])
    return [
        SkillSummary.build(s, *disp.get(s.category, (s.category, DEFAULT_CATEGORY_EMOJI)))
        for s in skills
    ]


@router.get("/{skill_id}/download")
async def download_skill(
    skill_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="SKILL_NOT_FOUND")

    filename = skill.title.replace(" ", "_") + ".md"
    return Response(
        content=skill.md_content,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{skill_id}", response_model=SkillDetail)
async def get_skill(
    skill_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="SKILL_NOT_FOUND")

    # 상세 조회 = 열람으로 집계. Core update()로만 건드려서 updated_at(onupdate)이
    # 조회만으로 같이 바뀌지 않게 한다.
    await db.execute(
        update(Skill).where(Skill.id == skill_id).values(view_count=Skill.view_count + 1)
    )
    await db.commit()
    name, emoji = await resolve_display(db, skill.category)
    return SkillDetail.build(skill, name, emoji)


@router.patch("/{skill_id}", response_model=SkillDetail)
async def update_skill(
    skill_id: str,
    body: SkillUpdate,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")

    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="SKILL_NOT_FOUND")
    if skill.user_id != payload["sub"]:
        raise HTTPException(status_code=403, detail="FORBIDDEN")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(skill, field, value)

    await db.commit()
    await db.refresh(skill)
    name, emoji = await resolve_display(db, skill.category)
    return SkillDetail.build(skill, name, emoji)


@router.delete("/{skill_id}", response_model=MessageResponse)
async def delete_skill(
    skill_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")

    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="SKILL_NOT_FOUND")
    if skill.user_id != payload["sub"]:
        raise HTTPException(status_code=403, detail="FORBIDDEN")

    await db.delete(skill)
    await db.commit()
    return MessageResponse(message="스킬이 삭제되었습니다.")
