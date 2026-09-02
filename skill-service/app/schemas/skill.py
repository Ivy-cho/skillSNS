import binascii
from base64 import b64decode
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, model_validator

# 스킬 본문에 HTML 태그(<div ...>, <meta ...>)나 쉘 명령(git push -f, `| base64 -d`, gh api -X POST 등)이
# 잔뜩 든 프롬프트를 등록하려 하면, Render 앞단 Cloudflare WAF가 요청 본문을 공격 패턴으로 보고
# 403(Blocked)으로 끊어버린다 — 그 응답엔 CORS 헤더가 없어 브라우저엔 "Failed to fetch"로만 보인다.
# 우리가 그 WAF 설정을 못 바꾸므로, 프론트가 그런 본문을 base64로 감싸 보내고(content_encoding="base64")
# 서버가 여기서 풀어 평문으로 되돌린다. 저장은 항상 평문.
CONTENT_FIELDS = ("title", "description", "md_content")


def _decode_b64_fields(obj):
    if getattr(obj, "content_encoding", None) != "base64":
        return obj
    for field in CONTENT_FIELDS:
        value = getattr(obj, field, None)
        if value is None:
            continue
        try:
            setattr(obj, field, b64decode(value, validate=True).decode("utf-8"))
        except (binascii.Error, ValueError) as e:
            raise ValueError(f"{field}: content_encoding=base64인데 base64로 디코드할 수 없습니다") from e
    return obj


class SkillCreate(BaseModel):
    title: str
    description: Optional[str] = None
    md_content: str
    # 카테고리는 서버가 카테고리명 Agent로 자동 분류하므로 클라이언트 값은 쓰지 않는다(하위호환용으로만 받음).
    category: Optional[str] = None
    # "base64"면 title/description/md_content가 base64 인코딩돼 온 것 — 위 _decode_b64_fields 참고.
    content_encoding: Optional[str] = None

    _decode = model_validator(mode="after")(_decode_b64_fields)


class SkillUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    md_content: Optional[str] = None
    # category는 카테고리명 Agent가 자동 관리하므로 사용자 수정 대상에서 뺀다.
    content_encoding: Optional[str] = None

    _decode = model_validator(mode="after")(_decode_b64_fields)


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
