import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class Skill(Base):
    __tablename__ = "skills"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    md_content: Mapped[str] = mapped_column(Text, nullable=False)
    # categories(소분류) 테이블의 id를 가리킨다 — 이름 단계에서 카테고리명 Agent가 정해
    # confirm/생성 시점에 채워진다. DB에 FK 제약(fk_skills_category)이 걸려 있고, 표시용
    # 이름·이모지는 feed/skill-service가 categories를 조인해 해석한다.
    category: Mapped[str] = mapped_column(
        String(50), ForeignKey("categories.id"), nullable=False
    )
    # 피드 "요즘 뜨는 스킬" 정렬 기준. GET /skills/{id}(상세 조회=열람)마다 1씩 늘어난다.
    # Core update()로만 건드려서 updated_at(onupdate)이 조회만으로 같이 바뀌지 않게 한다.
    view_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, nullable=False)
    skill_id: Mapped[str] = mapped_column(
        String, ForeignKey("skills.id", ondelete="CASCADE"), nullable=False
    )
    thread_id: Mapped[str] = mapped_column(String, nullable=False)
    # 오프닝 턴(사용자가 아무 말도 안 했는데 스킬이 먼저 인사하는 첫 턴)으로 시작된 세션인지.
    # 그런 세션의 히스토리 첫 메시지는 형식 맞추기용 더미 사용자 발화("(대화 시작)")라, 이력을
    # 내려줄 때 이 플래그가 켜져 있으면 맨 앞 사용자 메시지를 빼고 준다(문구 매칭에 의존하지 않음).
    # 채팅 목록(GET /chat/sessions)에서도 이 턴만 있는 세션(메시지 2개 이하)은 감춘다.
    started_with_opening: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    # 채팅 목록을 최근 대화순으로 정렬하기 위한 값 — 메시지가 오갈 때마다 라우트에서 갱신한다.
    # (실제 메시지 본문은 이 테이블이 아니라 LangGraph 체크포인터에 있어 여기엔 시각만 둔다.)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class SkillDraft(Base):
    __tablename__ = "skill_drafts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, nullable=False)
    thread_id: Mapped[str] = mapped_column(String, nullable=False)
    # workflows/skill_creation 5단계 파이프라인용. stage는 어느 노드에 있는지,
    # skill_info는 skill_info.schema.json과 같은 모양으로 단계별 필드가 누적되는 단일 객체.
    # (옛 status/title/description/md_content 컬럼은 제거됨 — 이제 이 값들은 skill_info 안에서만 관리된다.
    #  이 컬럼들을 읽던 옛 creator_graph.py/skill_creator.py 라우트는 이 설계로 완전히 대체돼 삭제됨.)
    stage: Mapped[str] = mapped_column(String, nullable=False, default="what_skill")
    skill_info: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # confirm() 시점에 채워진다 — 게시된 draft는 더 되돌릴 수 없게 막는 용도.
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
