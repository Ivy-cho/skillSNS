from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.schemas.feed import FeedItem

router = APIRouter(prefix="/feed", tags=["feed"])

# skills/users/scraps/categories는 각각 skill-service/user-service가 소유한 테이블 — 여긴 조회만 한다.
# s.category는 categories(소분류) id라, 표시용 이름·이모지는 categories를 조인해 가져온다.
# 아직 id로 백필되지 않은(라벨 문자열) 스킬은 조인이 안 맞으므로 COALESCE로 원본 값을 그대로 보여준다.
FEED_QUERY = text("""
    SELECT
        s.id, s.title, s.description,
        COALESCE(c.name, s.category) AS category,
        COALESCE(c.emoji, '🏷️') AS category_emoji,
        s.user_id, s.created_at,
        s.view_count,
        COALESCE(u.nickname, '알 수 없음') AS author_nickname,
        u.avatar_url AS author_avatar_url,
        COALESCE(sc.cnt, 0) AS scrap_count
    FROM skills s
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN categories c ON c.id = s.category
    LEFT JOIN (
        SELECT skill_id, COUNT(*) AS cnt FROM scraps GROUP BY skill_id
    ) sc ON sc.skill_id = s.id
    ORDER BY s.created_at DESC
    LIMIT :limit OFFSET :offset
""")

# q는 제목·소개·카테고리 이름·작성자 닉네임에 대해 대소문자 무시 부분일치(ILIKE)로 찾는다.
# 카테고리는 id가 아니라 조인한 이름(c.name)으로 검색한다. 백필 안 된 라벨도 s.category로 함께 훑는다.
FEED_SEARCH_QUERY = text("""
    SELECT
        s.id, s.title, s.description,
        COALESCE(c.name, s.category) AS category,
        COALESCE(c.emoji, '🏷️') AS category_emoji,
        s.user_id, s.created_at,
        s.view_count,
        COALESCE(u.nickname, '알 수 없음') AS author_nickname,
        u.avatar_url AS author_avatar_url,
        COALESCE(sc.cnt, 0) AS scrap_count
    FROM skills s
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN categories c ON c.id = s.category
    LEFT JOIN categories cm ON cm.id = c.parent_id
    LEFT JOIN (
        SELECT skill_id, COUNT(*) AS cnt FROM scraps GROUP BY skill_id
    ) sc ON sc.skill_id = s.id
    WHERE
        s.title ILIKE :q
        OR s.description ILIKE :q
        OR c.name ILIKE :q
        OR cm.name ILIKE :q
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
