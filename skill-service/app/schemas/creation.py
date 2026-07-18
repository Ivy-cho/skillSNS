from pydantic import BaseModel


class CreationResponse(BaseModel):
    draft_id: str
    stage: str
    messages: list[str]
    skill_info: dict
