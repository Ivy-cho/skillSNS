from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.schemas.category import CategoryNode
from app.services.categories import list_taxonomy

router = APIRouter(prefix="/categories", tags=["categories"])


# 공개 조회 — GET /skills, feed-service /feed 와 동일하게 인증 없이 연다.
@router.get("", response_model=list[CategoryNode])
async def get_categories(db: AsyncSession = Depends(get_db)):
    """카테고리 택소노미 전체(대분류 + 소분류)를 평면 목록으로. 프론트가 parent_id로 트리를
    복원해 칩 필터를 만든다. skill_count: 소분류=직접 스킬 수, 대분류=소속 소분류 합."""
    return await list_taxonomy(db)
