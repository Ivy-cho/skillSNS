from pydantic import BaseModel, Field


class SetAnthropicKeyRequest(BaseModel):
    api_key: str = Field(min_length=1)


class AnthropicKeyStatus(BaseModel):
    has_key: bool
