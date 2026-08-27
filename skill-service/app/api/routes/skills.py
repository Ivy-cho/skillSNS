import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.category_classifier import classify_category
from app.core.security import decode_token
from app.db.database import get_db
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
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")

    user_id = payload["sub"]
    # 카테고리는 카테고리명 Agent가 스킬 내용을 보고 자동으로 정한다. 다만 이건 부가기능이라,
    # 키가 없거나 분류가 실패해도 사용자가 쓴 스킬 자체는 '미분류'로라도 반드시 저장한다.
    category_id = None
    api_key = await resolve_llm_key(user_id, db)
    if api_key:
        try:
            category_id = await classify_category(body.md_content, api_key, db, definition=body.description or "")
        except Exception:
            await db.rollback()
            logger.exception("카테고리 자동 분류 실패 — 미분류로 저장 (title=%s)", body.title)
    if not category_id:
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
    name, emoji = await resolve_display(db, skill.category)
    return SkillSummary.build(skill, name, emoji)


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
