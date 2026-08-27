from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class FeedItem(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    category: str  # 소분류 이름 (id를 categories와 조인해 해석한 값)
    category_emoji: str = "🏷️"  # 소분류 이모지
    user_id: str
    author_nickname: str
    author_avatar_url: Optional[str] = None
    scrap_count: int
    view_count: int
    created_at: datetime
