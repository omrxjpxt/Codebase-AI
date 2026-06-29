from pydantic import BaseModel, ConfigDict
import uuid
from datetime import datetime

class ChunkBase(BaseModel):
    content: str
    metadata_: dict

class ChunkResponse(ChunkBase):
    id: uuid.UUID
    repository_id: uuid.UUID
    file_id: uuid.UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
