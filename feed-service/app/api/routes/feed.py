from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.schemas.feed import FeedItem

router = APIRouter(prefix="/feed", tags=["feed"])

# skills/users/scraps/categories는 각각 skill-service/user-service가 소유한 테이블 — 여긴 조회만 한다.
# s.category는 categories(소분류) id라, 표시용 이름·이모지는 categories를 조인해 가져온다.
# 아직 id로 백필되지 않은(라벨 문자열) 스킬은 조인이 안 맞으므로 COALESCE로 원본 값을 그대로 보여준다.
# cm은 소분류의 부모(대분류) — major_category와 대분류 이름 검색·필터에 쓴다.
_SELECT_FROM = """
    SELECT
        s.id, s.title, s.description,
        COALESCE(c.name, s.category) AS category,
        COALESCE(c.emoji, '🏷️') AS category_emoji,
        cm.name AS major_category,
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
"""

# 정렬 화이트리스트 — 사용자 입력을 SQL에 직접 넣지 않고 이 표의 값만 쓴다.
# 동점 처리는 이름 오름차순(가나다순)으로 고정해 페이지 경계가 흔들리지 않게 한다.
_SORT_ORDER = {
    "recent": "s.created_at DESC",
    "views": "s.view_count DESC, s.title ASC",
    "scraps": "COALESCE(sc.cnt, 0) DESC, s.title ASC",
}
DEFAULT_SORT = "recent"


# 공개 목록 조회라 skill-service의 GET /skills와 동일하게 인증 없이 연다.
# offset/limit로 페이징: 응답 길이가 limit보다 작으면 마지막 페이지라는 뜻.
@router.get("", response_model=list[FeedItem])
async def get_feed(
    limit: int = 20,
    offset: int = 0,
    q: Optional[str] = None,
    sort: str = DEFAULT_SORT,
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """스킬 피드.

    - `q`: 제목·소개·소분류·대분류·원본 라벨·작성자 닉네임에 대한 ILIKE 부분일치 (생략 가능)
    - `sort`: recent(기본) | views | scraps. 그 외 값은 400
    - `category`: 소분류 id 또는 소분류/대분류 **이름**으로 정확히 거른다 (칩 필터용, q와 병행 가능)
    - `limit`/`offset`: 페이징. 응답 길이 < limit이면 마지막 페이지
    """
    if sort not in _SORT_ORDER:
        raise HTTPException(status_code=400, detail="INVALID_SORT")

    q = q.strip() if q else None
    category = category.strip() if category else None

    where: list[str] = []
    params: dict = {"limit": limit, "offset": offset}

    if q:
        where.append(
            "(s.title ILIKE :q OR s.description ILIKE :q OR c.name ILIKE :q"
            " OR cm.name ILIKE :q OR s.category ILIKE :q OR u.nickname ILIKE :q)"
        )
        params["q"] = f"%{q}%"

    if category:
        # id 정확일치(백필된 스킬) + 소분류/대분류 이름 정확일치. 부분일치(ILIKE)가 아니라
        # 정확일치라, 제목·소개에 그 단어가 든 다른 카테고리 스킬이 딸려오지 않는다.
        where.append("(s.category = :cat OR c.name = :cat OR cm.name = :cat)")
        params["cat"] = category

    sql = _SELECT_FROM
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += f" ORDER BY {_SORT_ORDER[sort]} LIMIT :limit OFFSET :offset"

    result = await db.execute(text(sql), params)
    return [FeedItem(**row._mapping) for row in result.fetchall()]
