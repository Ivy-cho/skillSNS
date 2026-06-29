from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from supabase import create_client

from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.db.database import get_db
from app.models.user import RefreshToken, User
from app.schemas.auth import (
    AccessTokenResponse,
    LoginUrlResponse,
    MessageResponse,
    RefreshRequest,
    TokenResponse,
    UserInfo,
)

router = APIRouter(prefix="/auth", tags=["auth"])
bearer_scheme = HTTPBearer()

SUPPORTED_PROVIDERS = {"google", "kakao", "naver"}

supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


@router.get("/login/{provider}", response_model=LoginUrlResponse)
async def social_login(provider: str):
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail="INVALID_PROVIDER")

    response = supabase.auth.sign_in_with_oauth({
        "provider": provider,
        "options": {"redirect_to": settings.CALLBACK_URL},
    })

    return LoginUrlResponse(login_url=response.url)


@router.get("/callback", response_model=TokenResponse)
async def auth_callback(code: str, db: AsyncSession = Depends(get_db)):
    try:
        session = supabase.auth.exchange_code_for_session({"auth_code": code})
    except Exception:
        raise HTTPException(status_code=400, detail="INVALID_CODE")

    supabase_user = session.user
    if not supabase_user:
        raise HTTPException(status_code=500, detail="AUTH_SERVER_ERROR")

    provider = supabase_user.app_metadata.get("provider", "unknown")
    provider_id = supabase_user.id
    email = supabase_user.email

    # 카카오 전화번호 전용 계정은 email이 없을 수 있으므로 placeholder 생성
    if not email:
        email = f"{provider_id}@{provider}.skillsns"

    # 제공자별 닉네임 필드: Google=full_name, Kakao=name/preferred_username
    nickname = (
        supabase_user.user_metadata.get("full_name") or
        supabase_user.user_metadata.get("name") or
        supabase_user.user_metadata.get("preferred_username") or
        email.split("@")[0]
    )

    result = await db.execute(select(User).where(User.email == email, User.provider == provider))
    user = result.scalar_one_or_none()

    if not user:
        user = User(email=email, nickname=nickname, provider=provider, provider_id=provider_id)
        db.add(user)
        await db.flush()

    refresh_token_str, expires_at = create_refresh_token(user.id)

    await db.execute(delete(RefreshToken).where(RefreshToken.user_id == user.id))
    db.add(RefreshToken(user_id=user.id, token=refresh_token_str, expires_at=expires_at))

    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(user.id, user.email)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token_str,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserInfo(
            id=user.id,
            email=user.email,
            nickname=user.nickname,
            provider=user.provider,
            created_at=user.created_at,
        ),
    )


@router.get("/me", response_model=UserInfo)
async def get_me(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    payload = decode_token(credentials.credentials)

    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="USER_NOT_FOUND")

    return UserInfo(
        id=user.id,
        email=user.email,
        nickname=user.nickname,
        provider=user.provider,
        created_at=user.created_at,
    )


@router.post("/refresh", response_model=AccessTokenResponse)
async def refresh_token(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(body.refresh_token)

    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="INVALID_REFRESH_TOKEN")

    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token == body.refresh_token)
    )
    stored_token = result.scalar_one_or_none()

    if not stored_token:
        raise HTTPException(status_code=401, detail="INVALID_REFRESH_TOKEN")

    if stored_token.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="EXPIRED_REFRESH_TOKEN")

    result = await db.execute(select(User).where(User.id == stored_token.user_id))
    user = result.scalar_one_or_none()

    access_token = create_access_token(user.id, user.email)

    return AccessTokenResponse(
        access_token=access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/logout", response_model=MessageResponse)
async def logout(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    payload = decode_token(credentials.credentials)

    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")

    user_id = payload.get("sub")
    await db.execute(delete(RefreshToken).where(RefreshToken.user_id == user_id))
    await db.commit()

    return MessageResponse(message="로그아웃 되었습니다.")
