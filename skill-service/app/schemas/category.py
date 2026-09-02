from typing import Optional

from pydantic import BaseModel


class CategoryNode(BaseModel):
    id: str
    name: str
    emoji: str
    parent_id: Optional[str] = None  # None이면 대분류, 값이 있으면 그 대분류의 소분류
    # 소분류: 그 소분류에 직접 달린 스킬 수. 대분류: 소속 소분류들의 합.
    skill_count: int
