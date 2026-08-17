from datetime import datetime

from pydantic import BaseModel, Field


class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=30)


class FolderUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=30)


class FolderSummary(BaseModel):
    id: str
    name: str
    created_at: datetime
    skill_count: int

    model_config = {"from_attributes": True}


class ScrapCreate(BaseModel):
    skill_id: str
    folder_id: str


class ScrapItem(BaseModel):
    skill_id: str
    folder_id: str
    added_at: datetime

    model_config = {"from_attributes": True}
