from datetime import datetime

from pydantic import BaseModel


class LoginUrlResponse(BaseModel):
    login_url: str


class UserInfo(BaseModel):
    id: str
    email: str
    nickname: str
    provider: str
    created_at: datetime


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
