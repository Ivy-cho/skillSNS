from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db.database import get_db
from app.models.scrap import Scrap, ScrapFolder
from app.models.skill import Skill
from app.schemas.scrap import FolderCreate, FolderSummary, FolderUpdate, ScrapCreate, ScrapItem
from app.schemas.skill import MessageResponse

router = APIRouter(prefix="/scrap", tags=["scrap"])
bearer_scheme = HTTPBearer()


async def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> str:
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")
    return payload["sub"]


async def _get_owned_folder(folder_id: str, user_id: str, db: AsyncSession) -> ScrapFolder:
    result = await db.execute(
        select(ScrapFolder).where(ScrapFolder.id == folder_id, ScrapFolder.user_id == user_id)
    )
    folder = result.scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="FOLDER_NOT_FOUND")
    return folder


@router.get("/folders", response_model=list[FolderSummary])
async def list_folders(user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ScrapFolder, func.count(Scrap.id))
        .outerjoin(Scrap, Scrap.folder_id == ScrapFolder.id)
        .where(ScrapFolder.user_id == user_id)
        .group_by(ScrapFolder.id)
        .order_by(ScrapFolder.created_at)
    )
    return [
        FolderSummary(id=folder.id, name=folder.name, created_at=folder.created_at, skill_count=count)
        for folder, count in result.all()
    ]


@router.post("/folders", response_model=FolderSummary, status_code=201)
async def create_folder(
    body: FolderCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    folder = ScrapFolder(user_id=user_id, name=body.name)
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return FolderSummary(id=folder.id, name=folder.name, created_at=folder.created_at, skill_count=0)


@router.patch("/folders/{folder_id}", response_model=FolderSummary)
async def rename_folder(
    folder_id: str,
    body: FolderUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    folder = await _get_owned_folder(folder_id, user_id, db)
    folder.name = body.name
    await db.commit()
    await db.refresh(folder)

    count = await db.scalar(select(func.count(Scrap.id)).where(Scrap.folder_id == folder.id))
    return FolderSummary(id=folder.id, name=folder.name, created_at=folder.created_at, skill_count=count or 0)


@router.delete("/folders/{folder_id}", response_model=MessageResponse)
async def delete_folder(
    folder_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    folder = await _get_owned_folder(folder_id, user_id, db)
    await db.delete(folder)  # ondelete="CASCADE"로 안의 scrap도 함께 삭제됨
    await db.commit()
    return MessageResponse(message="폴더가 삭제되었습니다.")


@router.get("", response_model=list[ScrapItem])
async def list_scraps(
    folder_id: Optional[str] = None,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    query = select(Scrap).where(Scrap.user_id == user_id)
    if folder_id:
        query = query.where(Scrap.folder_id == folder_id)
    result = await db.execute(query.order_by(Scrap.added_at.desc()))
    return [
        ScrapItem(skill_id=s.skill_id, folder_id=s.folder_id, added_at=s.added_at)
        for s in result.scalars().all()
    ]


@router.post("", response_model=ScrapItem, status_code=201)
async def add_scrap(
    body: ScrapCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_folder(body.folder_id, user_id, db)

    skill = await db.get(Skill, body.skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="SKILL_NOT_FOUND")

    result = await db.execute(
        select(Scrap).where(Scrap.user_id == user_id, Scrap.skill_id == body.skill_id)
    )
    scrap = result.scalar_one_or_none()

    if scrap:
        scrap.folder_id = body.folder_id  # 이미 담겨 있으면 폴더만 이동
    else:
        scrap = Scrap(user_id=user_id, skill_id=body.skill_id, folder_id=body.folder_id)
        db.add(scrap)

    await db.commit()
    await db.refresh(scrap)
    return ScrapItem(skill_id=scrap.skill_id, folder_id=scrap.folder_id, added_at=scrap.added_at)


@router.delete("/{skill_id}", response_model=MessageResponse)
async def remove_scrap(
    skill_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(delete(Scrap).where(Scrap.user_id == user_id, Scrap.skill_id == skill_id))
    await db.commit()
    return MessageResponse(message="스크랩에서 뺐습니다.")
