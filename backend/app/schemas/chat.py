from pydantic import BaseModel

from typing import List, Dict, Any, Optional

class AskRequest(BaseModel):
    question: str

class AskResponse(BaseModel):
    answer: str
    sources: Optional[List[Dict[str, Any]]] = None
