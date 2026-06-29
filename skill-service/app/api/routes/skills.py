from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db.database import get_db
from app.models.skill import Skill
from app.schemas.skill import MessageResponse, SkillCreate, SkillDetail, SkillSummary, SkillUpdate

router = APIRouter(prefix="/skills", tags=["skills"])
bearer_scheme = HTTPBearer()


@router.post("", response_model=SkillSummary, status_code=201)
async def create_skill(
    body: SkillCreate,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")

    skill = Skill(
        user_id=payload["sub"],
        title=body.title,
        description=body.description,
        md_content=body.md_content,
    )
    db.add(skill)
    await db.commit()
    await db.refresh(skill)
    return skill


@router.get("", response_model=list[SkillSummary])
async def list_skills(
    user_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Skill)
    if user_id:
        stmt = stmt.where(Skill.user_id == user_id)
    result = await db.execute(stmt.order_by(Skill.created_at.desc()))
    return result.scalars().all()


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
    return skill


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
    return skill


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
