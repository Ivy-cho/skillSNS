from datetime import datetime

from pydantic import BaseModel, Field


class LoginUrlResponse(BaseModel):
    login_url: str


class UserInfo(BaseModel):
    id: str
    email: str
    nickname: str
    provider: str
    created_at: datetime
    bio: str | None = None
    avatar_url: str | None = None


class ProfilePatch(BaseModel):
    nickname: str | None = Field(default=None, min_length=1, max_length=20)
    bio: str | None = Field(default=None, max_length=80)
    avatar_url: str | None = None


class AvatarUploadResponse(BaseModel):
    avatar_url: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserInfo


class RefreshRequest(BaseModel):
    refresh_token: str


class AccessTokenResponse(BaseModel):
    access_token: str
    expires_in: int


class MessageResponse(BaseModel):
    message: str
