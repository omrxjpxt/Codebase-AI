from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.models.user import User
from app.models.chat import ChatSession, Message
from app.models.repository import Repository
from app.api.dependencies import get_current_user
from pydantic import BaseModel
import uuid
from datetime import datetime

router = APIRouter(prefix="/chat-sessions", tags=["chat_sessions"])

class ChatSessionWithRepoResponse(BaseModel):
    id: uuid.UUID
    repository_id: uuid.UUID
    repository_name: str
    title: str
    created_at: datetime
    last_message_preview: str | None = None
    
    class Config:
        from_attributes = True

@router.get("", response_model=List[ChatSessionWithRepoResponse])
async def list_all_chat_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = (
        select(ChatSession, Repository.name)
        .join(Repository, ChatSession.repository_id == Repository.id)
        .where(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.created_at.desc())
    )
    
    result = await db.execute(stmt)
    rows = result.all()
    
    response_data = []
    for session, repo_name in rows:
        # Fetch last message preview
        msg_stmt = (
            select(Message.content)
            .where(Message.chat_session_id == session.id)
            .order_by(Message.created_at.desc())
            .limit(1)
        )
        msg_result = await db.execute(msg_stmt)
        last_msg = msg_result.scalar_one_or_none()
        
        # truncate preview
        preview = None
        if last_msg:
            preview = last_msg[:100] + "..." if len(last_msg) > 100 else last_msg
            
        response_data.append(
            ChatSessionWithRepoResponse(
                id=session.id,
                repository_id=session.repository_id,
                repository_name=repo_name,
                title=session.title,
                created_at=session.created_at,
                last_message_preview=preview
            )
        )
        
    return response_data
