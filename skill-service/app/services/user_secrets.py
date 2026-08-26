from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.crypto import decrypt_secret
from app.models.user_secret import UserSecret

# 본인 키를 등록 안 한 사람도 일단 맛보게 — 계정당 평생 이 횟수까지는 서버 기본 키로
# 무료(스킬 생성·대화 합산). LLM 요금 부담 때문에 처음부터 자기 키를 넣으라고 하면
# 아예 안 써보고 이탈하는 사람이 많아서 만든 트라이얼.
FREE_TRIAL_LIMIT = 3


async def get_user_anthropic_key(user_id: str, db: AsyncSession) -> Optional[str]:
    """대화·스킬 생성에서 쓸 사용자 본인의 Anthropic 키. 등록 안 했으면 None —
    호출부가 서버 공용 키로 몰래 폴백하지 않고 등록 안내를 보여줘야 한다."""
    result = await db.execute(select(UserSecret).where(UserSecret.user_id == user_id))
    secret = result.scalar_one_or_none()
    if not secret or not secret.anthropic_api_key_encrypted:
        return None
    return decrypt_secret(secret.anthropic_api_key_encrypted)


async def resolve_llm_key(user_id: str, db: AsyncSession) -> Optional[str]:
    """실제로 이번 호출에 쓸 키. 본인 키가 있으면 그걸 쓰고(카운트 안 건드림), 없으면
    무료 체험 한도 안에서만 서버 기본 키(settings.ANTHROPIC_API_KEY)를 내주고 카운트를
    올린다. 한도를 다 썼으면 None — 호출부는 기존과 동일하게 키 등록 안내로 이어간다."""
    result = await db.execute(select(UserSecret).where(UserSecret.user_id == user_id))
    secret = result.scalar_one_or_none()

    if secret and secret.anthropic_api_key_encrypted:
        return decrypt_secret(secret.anthropic_api_key_encrypted)

    if not secret:
        secret = UserSecret(user_id=user_id)
        db.add(secret)

    if secret.free_turns_used >= FREE_TRIAL_LIMIT:
        return None

    secret.free_turns_used += 1
    await db.commit()
    return settings.ANTHROPIC_API_KEY
