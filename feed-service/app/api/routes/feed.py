from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.schemas.feed import FeedItem

router = APIRouter(prefix="/feed", tags=["feed"])

# skills/users/scraps는 각각 skill-service/user-service가 소유한 테이블 — 여긴 조회만 한다.
FEED_QUERY = text("""
    SELECT
        s.id, s.title, s.description, s.category, s.user_id, s.created_at,
        s.view_count,
        COALESCE(u.nickname, '알 수 없음') AS author_nickname,
        COALESCE(sc.cnt, 0) AS scrap_count
    FROM skills s
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN (
        SELECT skill_id, COUNT(*) AS cnt FROM scraps GROUP BY skill_id
    ) sc ON sc.skill_id = s.id
    ORDER BY s.created_at DESC
    LIMIT :limit
""")


# 공개 목록 조회라 skill-service의 GET /skills와 동일하게 인증 없이 연다.
@router.get("", response_model=list[FeedItem])
async def get_feed(limit: int = 50, db: AsyncSession = Depends(get_db)):
    result = await db.execute(FEED_QUERY, {"limit": limit})
    return [FeedItem(**row._mapping) for row in result.fetchall()]
