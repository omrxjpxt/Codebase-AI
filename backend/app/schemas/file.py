from pydantic import BaseModel, ConfigDict
import uuid

class FileBase(BaseModel):
    path: str
    language: str
    size: int

class FileResponse(FileBase):
    id: uuid.UUID
    repository_id: uuid.UUID

    model_config = ConfigDict(from_attributes=True)
