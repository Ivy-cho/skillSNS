from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class FeedItem(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    category: str
    user_id: str
    author_nickname: str
    author_avatar_url: Optional[str] = None
    scrap_count: int
    view_count: int
    created_at: datetime
