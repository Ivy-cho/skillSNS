from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
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
    AvatarUploadResponse,
    LoginUrlResponse,
    MessageResponse,
    ProfilePatch,
    RefreshRequest,
    TokenResponse,
    UserInfo,
)

router = APIRouter(prefix="/auth", tags=["auth"])
bearer_scheme = HTTPBearer()

SUPPORTED_PROVIDERS = {"google", "kakao"}
AVATAR_BUCKET = "avatars"
AVATAR_EXT_BY_CONTENT_TYPE = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}
MAX_AVATAR_SIZE = 5 * 1024 * 1024

# 소셜 로그인(OAuth) 흐름은 유저 권한만 필요해 anon 키로 충분하다.
supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
# 아바타 업로드는 우리 JWT로 이미 인증을 마친 뒤 서버가 대신 올리는 것이라, Storage RLS를
# 우회할 수 있는 service-role 키를 쓴다 (Supabase 세션이 없어 anon 키로는 막힘).
supabase_admin = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


def _to_user_info(user: User) -> UserInfo:
    return UserInfo(
        id=user.id,
        email=user.email,
        nickname=user.nickname,
        provider=user.provider,
        created_at=user.created_at,
        bio=user.bio,
        avatar_url=user.avatar_url,
    )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_token(credentials.credentials)

    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")

    result = await db.execute(select(User).where(User.id == payload.get("sub")))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="USER_NOT_FOUND")

    return user


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

    # 제공자별 닉네임 필드: Google=full_name, Kakao=name/preferred_username
    nickname = (
        supabase_user.user_metadata.get("full_name") or
        supabase_user.user_metadata.get("name") or
        supabase_user.user_metadata.get("preferred_username") or
        (email.split("@")[0] if email else provider_id[:8])
    )

    # provider_id로 기존 사용자 조회 (email 없어도 항상 식별 가능)
    result = await db.execute(
        select(User).where(User.provider_id == provider_id, User.provider == provider)
    )
    user = result.scalar_one_or_none()

    if not user:
        # email이 없으면 placeholder 생성 (DB NOT NULL 제약 충족용)
        stored_email = email or f"{provider_id}@{provider}.skillsns"
        user = User(email=stored_email, nickname=nickname, provider=provider, provider_id=provider_id)
        db.add(user)
        await db.flush()
    elif email and user.email != email and not user.email.endswith(".skillsns"):
        # 실제 email이 새로 들어온 경우 업데이트
        user.email = email

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
        user=_to_user_info(user),
    )


@router.get("/me", response_model=UserInfo)
async def get_me(user: User = Depends(get_current_user)):
    return _to_user_info(user)


@router.patch("/me", response_model=UserInfo)
async def update_profile(
    patch: ProfilePatch,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    for field, value in patch.model_dump(exclude_unset=True).items():
        setattr(user, field, value)

    await db.commit()
    await db.refresh(user)

    return _to_user_info(user)


@router.post("/me/avatar", response_model=AvatarUploadResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    ext = AVATAR_EXT_BY_CONTENT_TYPE.get(file.content_type or "")
    if not ext:
        raise HTTPException(status_code=400, detail="INVALID_FILE_TYPE")

    content = await file.read()
    if len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(status_code=400, detail="FILE_TOO_LARGE")

    path = f"{user.id}.{ext}"
    try:
        supabase_admin.storage.from_(AVATAR_BUCKET).upload(
            path, content, file_options={"content-type": file.content_type, "upsert": "true"}
        )
    except Exception:
        raise HTTPException(status_code=500, detail="AVATAR_UPLOAD_FAILED")

    avatar_url = supabase_admin.storage.from_(AVATAR_BUCKET).get_public_url(path)
    return AvatarUploadResponse(avatar_url=avatar_url)


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
