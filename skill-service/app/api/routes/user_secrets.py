from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import encrypt_secret
from app.core.security import decode_token
from app.db.database import get_db
from app.models.user_secret import UserSecret
from app.schemas.skill import MessageResponse
from app.schemas.user_secret import AnthropicKeyStatus, SetAnthropicKeyRequest

router = APIRouter(prefix="/me", tags=["user-secrets"])
bearer_scheme = HTTPBearer()


def _get_user_id(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> str:
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")
    return payload["sub"]


@router.get("/anthropic-key", response_model=AnthropicKeyStatus)
async def get_anthropic_key_status(
    user_id: str = Depends(_get_user_id), db: AsyncSession = Depends(get_db)
):
    """등록 여부만 알려준다 — 평문 키는 저장 후 다시는 클라이언트로 안 돌려준다."""
    result = await db.execute(select(UserSecret).where(UserSecret.user_id == user_id))
    secret = result.scalar_one_or_none()
    return AnthropicKeyStatus(has_key=bool(secret and secret.anthropic_api_key_encrypted))


@router.put("/anthropic-key", response_model=MessageResponse)
async def set_anthropic_key(
    body: SetAnthropicKeyRequest,
    user_id: str = Depends(_get_user_id),
    db: AsyncSession = Depends(get_db),
):
    encrypted = encrypt_secret(body.api_key.strip())
    result = await db.execute(select(UserSecret).where(UserSecret.user_id == user_id))
    secret = result.scalar_one_or_none()
    if secret:
        secret.anthropic_api_key_encrypted = encrypted
    else:
        db.add(UserSecret(user_id=user_id, anthropic_api_key_encrypted=encrypted))
    await db.commit()
    return MessageResponse(message="등록됐습니다.")


@router.delete("/anthropic-key", response_model=MessageResponse)
async def delete_anthropic_key(
    user_id: str = Depends(_get_user_id), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(UserSecret).where(UserSecret.user_id == user_id))
    secret = result.scalar_one_or_none()
    if secret:
        await db.delete(secret)
        await db.commit()
    return MessageResponse(message="삭제됐습니다.")
