from datetime import datetime, timezone

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class UserSecret(Base):
    """사용자가 직접 등록한 LLM 키 보관용. 대화·스킬 생성 비용은 이 키로 낸다(서버
    공용 키를 쓰지 않는다) — 값은 항상 암호화해서 저장하고, API로도 존재 여부만
    내려주고 평문은 절대 다시 클라이언트에 돌려주지 않는다(app/core/crypto.py 참고)."""

    __tablename__ = "user_secrets"

    user_id: Mapped[str] = mapped_column(String, primary_key=True)
    anthropic_api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
