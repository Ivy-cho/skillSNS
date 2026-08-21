from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt_secret
from app.models.user_secret import UserSecret


async def get_user_anthropic_key(user_id: str, db: AsyncSession) -> Optional[str]:
    """대화·스킬 생성에서 쓸 사용자 본인의 Anthropic 키. 등록 안 했으면 None —
    호출부가 서버 공용 키로 몰래 폴백하지 않고 등록 안내를 보여줘야 한다."""
    result = await db.execute(select(UserSecret).where(UserSecret.user_id == user_id))
    secret = result.scalar_one_or_none()
    if not secret or not secret.anthropic_api_key_encrypted:
        return None
    return decrypt_secret(secret.anthropic_api_key_encrypted)
