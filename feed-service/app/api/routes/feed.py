from typing import Optional

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
    LIMIT :limit OFFSET :offset
""")

# q는 제목·소개·카테고리·작성자 닉네임에 대해 대소문자 무시 부분일치(ILIKE)로 찾는다.
# 프론트가 기존에 하던 클라이언트 필터링(제목/소개/작성자/카테고리 훑기)과 동일한 범위.
FEED_SEARCH_QUERY = text("""
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
    WHERE
        s.title ILIKE :q
        OR s.description ILIKE :q
        OR s.category ILIKE :q
        OR u.nickname ILIKE :q
    ORDER BY s.created_at DESC
    LIMIT :limit OFFSET :offset
""")


# 공개 목록 조회라 skill-service의 GET /skills와 동일하게 인증 없이 연다.
# offset/limit로 페이징: 응답 길이가 limit보다 작으면 마지막 페이지라는 뜻.
@router.get("", response_model=list[FeedItem])
async def get_feed(
    limit: int = 20,
    offset: int = 0,
    q: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    q = q.strip() if q else None
    params = {"limit": limit, "offset": offset}
    if q:
        result = await db.execute(FEED_SEARCH_QUERY, {**params, "q": f"%{q}%"})
    else:
        result = await db.execute(FEED_QUERY, params)
    return [FeedItem(**row._mapping) for row in result.fetchall()]
