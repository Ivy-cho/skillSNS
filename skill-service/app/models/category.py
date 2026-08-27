import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base

# 카테고리 이모지 기본값. 표시할 이모지를 못 구했을 때(예: 백필 전 라벨) 공통 폴백으로 쓴다.
DEFAULT_CATEGORY_EMOJI = "🏷️"


class Category(Base):
    """대분류/소분류를 한 테이블에 담는 자기참조 택소노미. parent_id가 NULL이면 대분류,
    값이 있으면 그 대분류에 속한 소분류다. 카테고리명 Agent가 스킬을 만들 때 재사용우선으로
    채우고(없을 때만 새로 생성), skills.category는 소분류 행의 id를 가리킨다."""

    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    # 홈/피드/채팅목록 아바타에 쓰는 표시 이모지. 카테고리명 Agent가 생성 시 함께 정한다.
    emoji: Mapped[str] = mapped_column(String(16), nullable=False, default=DEFAULT_CATEGORY_EMOJI)
    # 대분류는 parent_id가 없다(NULL). 소분류는 자기 대분류의 id를 가리킨다.
    parent_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("categories.id", ondelete="CASCADE"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # 이름 중복(=난립) 방지. Postgres는 UNIQUE에서 NULL을 서로 다르게 보므로 대분류(parent NULL)와
    # 소분류를 부분 인덱스로 나눠 건다: 대분류는 이름이 전역 유일, 소분류는 같은 대분류 안에서 유일.
    __table_args__ = (
        Index("uq_category_major_name", "name", unique=True, postgresql_where=text("parent_id IS NULL")),
        Index(
            "uq_category_sub_name",
            "parent_id",
            "name",
            unique=True,
            postgresql_where=text("parent_id IS NOT NULL"),
        ),
    )
