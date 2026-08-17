import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
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
    # skill_drafts.skill_info.category에서 confirm 시점에 옮겨온다. 정규화된 카테고리
    # 테이블은 두지 않는다 — "기타"로 사용자가 직접 입력하는 자유 텍스트도 허용해야 해서,
    # 지금 규모에선 FK로 강제하는 게 오히려 과설계다. feed-service의 카테고리별 조회는
    # 이 문자열 컬럼으로 필터링하면 된다.
    category: Mapped[str] = mapped_column(String(50), nullable=False)
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
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
