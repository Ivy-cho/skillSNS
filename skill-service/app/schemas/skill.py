from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SkillCreate(BaseModel):
    title: str
    description: Optional[str] = None
    md_content: str
    category: str


class SkillUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    md_content: Optional[str] = None


class SkillSummary(BaseModel):
    id: str
    user_id: str
    title: str
    description: Optional[str]
    category: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SkillDetail(SkillSummary):
    md_content: str


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    session_id: Optional[str]
    reply: str


class MessageItem(BaseModel):
    role: str
    content: str


class ChatHistoryResponse(BaseModel):
    session_id: str
    skill_id: str
    messages: list[MessageItem]


class ChatSessionSummary(BaseModel):
    skill_id: str
    skill_title: str
    category: str
    session_id: str
    last_message: str
    last_message_at: datetime


class MessageResponse(BaseModel):
    message: str
