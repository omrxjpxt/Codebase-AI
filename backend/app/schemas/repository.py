from pydantic import BaseModel, ConfigDict
import uuid
from datetime import datetime
from typing import Optional

class RepositoryBase(BaseModel):
    name: str
    github_url: Optional[str] = None

class RepositoryCreate(RepositoryBase):
    pass

class RepositoryResponse(RepositoryBase):
    id: uuid.UUID
    user_id: uuid.UUID
    status: str
    error_message: Optional[str] = None
    summary: Optional[str] = None
    upload_date: datetime
    file_count: Optional[int] = None
    chunk_count: Optional[int] = None
    indexed_chunk_count: Optional[int] = None
    is_indexed: Optional[bool] = None

    model_config = ConfigDict(from_attributes=True)

class RepositoryDetailResponse(RepositoryResponse):
    file_count: int
    chunk_count: int
    indexed_chunk_count: int = 0
    is_indexed: bool = False
    languages: list[str]
