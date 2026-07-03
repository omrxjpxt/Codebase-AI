import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.database import get_db
from app.models.user import User
from app.models.chat import ChatSession, Message
from app.models.repository import Repository
from app.api.dependencies import get_current_user
from pydantic import BaseModel
from datetime import datetime
import json
from fastapi.responses import StreamingResponse
from app.schemas.chat import AskRequest
from app.services.retrieval_service import retrieve_relevant_chunks
from google import genai
from app.core.config import settings

router = APIRouter(prefix="/repositories", tags=["chat"])

class ChatSessionCreate(BaseModel):
    title: str = "New Chat"

class ChatSessionUpdate(BaseModel):
    title: str

class ChatSessionResponse(BaseModel):
    id: uuid.UUID
    repository_id: uuid.UUID
    title: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class MessageResponse(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class ChatSessionDetailResponse(ChatSessionResponse):
    messages: List[MessageResponse]

@router.post("/{id}/chat-sessions", response_model=ChatSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_chat_session(
    id: uuid.UUID,
    data: ChatSessionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify repo
    stmt = select(Repository).where(Repository.id == id, Repository.user_id == current_user.id)
    repo = (await db.execute(stmt)).scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
        
    session = ChatSession(
        user_id=current_user.id,
        repository_id=id,
        title=data.title
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session

@router.get("/{id}/chat-sessions", response_model=List[ChatSessionResponse])
async def list_chat_sessions(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ChatSession).where(
        ChatSession.repository_id == id, 
        ChatSession.user_id == current_user.id
    ).order_by(ChatSession.created_at.desc())
    
    result = await db.execute(stmt)
    return result.scalars().all()

@router.delete("/chat-sessions/all", status_code=status.HTTP_204_NO_CONTENT)
async def delete_all_chat_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ChatSession).where(ChatSession.user_id == current_user.id)
    result = await db.execute(stmt)
    sessions = result.scalars().all()
    for session in sessions:
        await db.delete(session)
    await db.commit()

@router.get("/chat-sessions/{session_id}", response_model=ChatSessionDetailResponse)
async def get_chat_session(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
    session = (await db.execute(stmt)).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")
        
    # Get messages
    msg_stmt = select(Message).where(Message.chat_session_id == session_id).order_by(Message.created_at.asc())
    messages = (await db.execute(msg_stmt)).scalars().all()
    
    return {
        "id": session.id,
        "repository_id": session.repository_id,
        "title": session.title,
        "created_at": session.created_at,
        "messages": messages
    }

@router.patch("/chat-sessions/{session_id}", response_model=ChatSessionResponse)
async def update_chat_session(
    session_id: uuid.UUID,
    data: ChatSessionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
    session = (await db.execute(stmt)).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")
        
    session.title = data.title
    await db.commit()
    await db.refresh(session)
    return session

@router.delete("/chat-sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat_session(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
    session = (await db.execute(stmt)).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")
        
    await db.delete(session)
    await db.commit()


@router.post("/chat-sessions/{session_id}/ask")
async def ask_chat_session(
    session_id: uuid.UUID,
    request: AskRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
    session = (await db.execute(stmt)).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")
        
    repo_stmt = select(Repository).where(Repository.id == session.repository_id)
    repo = (await db.execute(repo_stmt)).scalar_one_or_none()
    
    # Save user message
    user_msg = Message(chat_session_id=session.id, role="user", content=request.question)
    db.add(user_msg)
    await db.commit()
    
    # Retrieve
    sources_data = await retrieve_relevant_chunks(db, session.repository_id, request.question, top_k=8)
    file_paths = list(set([s['path'] for s in sources_data]))
    chunks_text = "\n\n".join([f"--- File: {s['path']} ---\n{s['content']}" for s in sources_data])
    
    prompt = f"""You are a senior software engineer helping a developer understand a codebase.

Repository:
{repo.name}

Relevant Files:
{', '.join(file_paths)}

Relevant Code Context:
{chunks_text}

User Question:
{request.question}

Provide:

1. Overview
2. Relevant Files
3. Explanation
4. Next Steps (if applicable)"""

    from app.services.gemini_service import gemini_service
    
    async def generate():
        try:
            response_stream = gemini_service.generate_content_stream(
                model=settings.CHAT_MODEL,
                contents=prompt,
            )
            
            yield json.dumps({"type": "sources", "data": sources_data}) + "\n"
            
            full_text = ""
            async for chunk_text in response_stream:
                if chunk_text:
                    full_text += chunk_text
                    yield json.dumps({"type": "chunk", "text": chunk_text}) + "\n"
                    
            from app.db.database import AsyncSessionLocal
            async with AsyncSessionLocal() as local_db:
                assistant_msg = Message(chat_session_id=session_id, role="assistant", content=full_text)
                local_db.add(assistant_msg)
                await local_db.commit()
        except Exception as e:
            # Check if it's an HTTPException from gemini_service to extract detail
            from fastapi import HTTPException
            if isinstance(e, HTTPException):
                yield json.dumps({"type": "error", "message": str(e.detail)}) + "\n"
            else:
                yield json.dumps({"type": "error", "message": str(e)}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")
