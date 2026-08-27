from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SkillCreate(BaseModel):
    title: str
    description: Optional[str] = None
    md_content: str
    # 카테고리는 서버가 카테고리명 Agent로 자동 분류하므로 클라이언트 값은 쓰지 않는다(하위호환용으로만 받음).
    category: Optional[str] = None


class SkillUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    md_content: Optional[str] = None
    # category는 카테고리명 Agent가 자동 관리하므로 사용자 수정 대상에서 뺀다.


class SkillSummary(BaseModel):
    id: str
    user_id: str
    title: str
    description: Optional[str]
    category: str  # 소분류 이름 (skills.category의 id를 categories와 대조해 해석한 값)
    category_emoji: str = "🏷️"  # 소분류 이모지
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def build(cls, skill, name: str, emoji: str) -> "SkillSummary":
        return cls(
            id=skill.id,
            user_id=skill.user_id,
            title=skill.title,
            description=skill.description,
            category=name,
            category_emoji=emoji,
            created_at=skill.created_at,
        )


class SkillDetail(SkillSummary):
    md_content: str

    @classmethod
    def build(cls, skill, name: str, emoji: str) -> "SkillDetail":
        return cls(
            **SkillSummary.build(skill, name, emoji).model_dump(),
            md_content=skill.md_content,
        )


class ChatRequest(BaseModel):
    # 새 대화를 열 때(POST /chat/{skill_id})는 생략 가능 — 생략하면 스킬이 스스로
    # 소개하고 첫 질문을 던지는 "오프닝" 턴으로 처리된다. 대화 이어가기는 계속 필수.
    message: Optional[str] = None


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
    category: str  # 소분류 이름
    category_emoji: str = "🏷️"  # 소분류 이모지
    session_id: str
    last_message: str
    last_message_at: datetime


class MessageResponse(BaseModel):
    message: str
