from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import DEFAULT_CATEGORY_EMOJI, Category

# 자동 분류가 실패했을 때도 스킬을 반드시 저장하기 위한 대체 카테고리 이름.
FALLBACK_CATEGORY_NAME = "미분류"


async def get_display_map(db: AsyncSession, category_ids) -> dict[str, tuple[str, str]]:
    """소분류 id -> (이름, 이모지) 배치 조회. 표시용. 아직 라벨(백필 전)인 값은 여기에 안 담기므로
    호출부에서 (원본값, 기본이모지)로 폴백한다."""
    ids = {i for i in category_ids if i}
    if not ids:
        return {}
    rows = (
        await db.execute(
            select(Category.id, Category.name, Category.emoji).where(Category.id.in_(ids))
        )
    ).all()
    return {r.id: (r.name, r.emoji) for r in rows}


async def resolve_display(db: AsyncSession, category_id: str) -> tuple[str, str]:
    """단건 카테고리 id -> (이름, 이모지). 못 찾는 값(백필 전 라벨 등)은 (원본값, 기본이모지)로
    폴백한다. 라우트들이 응답에 표시값을 채울 때 공용으로 쓴다."""
    return (await get_display_map(db, [category_id])).get(
        category_id, (category_id, DEFAULT_CATEGORY_EMOJI)
    )


async def get_taxonomy_tree(db: AsyncSession) -> str:
    """현재 등록된 대분류/소분류를 카테고리명 Agent 프롬프트에 넣을 트리 텍스트로 만든다."""
    cats = (await db.execute(select(Category))).scalars().all()
    majors = [c for c in cats if c.parent_id is None]
    if not majors:
        return "(아직 등록된 카테고리가 없습니다. 이 스킬로 첫 분류를 만드세요.)"

    subs_by_major: dict[str, list[Category]] = {}
    for c in cats:
        if c.parent_id is not None:
            subs_by_major.setdefault(c.parent_id, []).append(c)

    lines: list[str] = []
    for m in sorted(majors, key=lambda x: x.name):
        lines.append(f"- {m.name}")
        for s in sorted(subs_by_major.get(m.id, []), key=lambda x: x.name):
            lines.append(f"  - {s.name}")
    return "\n".join(lines)


async def upsert_category(
    db: AsyncSession,
    *,
    major_name: str,
    major_emoji: str,
    sub_name: str,
    sub_emoji: str,
) -> str:
    """대분류/소분류를 재사용우선으로 찾고, 없으면 이모지와 함께 만들어서 소분류 id를 돌려준다.
    LLM이 '신규'라고 판단했어도 여기서 이름으로 한 번 더 조회해 중복 생성을 막는다.
    기존 카테고리를 재사용할 때는 이미 정해진 이모지를 그대로 두고 덮어쓰지 않는다."""
    major_name = (major_name or "").strip()
    sub_name = (sub_name or "").strip()
    if not major_name or not sub_name:
        raise ValueError("major_name/sub_name must be non-empty")

    major = (
        await db.execute(
            select(Category).where(Category.parent_id.is_(None), Category.name == major_name)
        )
    ).scalar_one_or_none()
    if major is None:
        major = Category(name=major_name, parent_id=None, emoji=(major_emoji or "").strip() or DEFAULT_CATEGORY_EMOJI)
        db.add(major)
        await db.flush()

    sub = (
        await db.execute(
            select(Category).where(Category.parent_id == major.id, Category.name == sub_name)
        )
    ).scalar_one_or_none()
    if sub is None:
        sub = Category(name=sub_name, parent_id=major.id, emoji=(sub_emoji or "").strip() or DEFAULT_CATEGORY_EMOJI)
        db.add(sub)
        await db.flush()

    return sub.id


async def get_fallback_category_id(db: AsyncSession) -> str:
    """자동 분류가 실패하거나 키가 없을 때도 스킬을 저장하기 위한 '미분류' 소분류 id.
    get-or-create라 항상 유효한 categories.id를 돌려준다(FK 위반 없이 저장 가능)."""
    return await upsert_category(
        db,
        major_name=FALLBACK_CATEGORY_NAME,
        major_emoji=DEFAULT_CATEGORY_EMOJI,
        sub_name=FALLBACK_CATEGORY_NAME,
        sub_emoji=DEFAULT_CATEGORY_EMOJI,
    )
