import os
import shutil
import tempfile
import uuid
import asyncio
from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.database import get_db
from app.models.user import User
from app.models.repository import Repository
from app.models.file import File as DBFile
from app.models.chunk import Chunk
from app.schemas.repository import RepositoryResponse, RepositoryDetailResponse
from app.schemas.file import FileResponse
from app.schemas.chunk import ChunkResponse
from app.schemas.chat import AskRequest, AskResponse
from google import genai
from app.core.config import settings
from app.api.dependencies import get_current_user
from app.services.repository_service import process_and_store_repository, generate_embeddings_for_repo
from app.services.retrieval_service import retrieve_relevant_chunks

router = APIRouter(prefix="/repositories", tags=["repositories"])

@router.post("/upload", response_model=RepositoryResponse, status_code=status.HTTP_201_CREATED)
async def upload_repository(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="Only ZIP files are supported")
        
    if file.size and file.size > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File too large. Maximum size is {settings.MAX_UPLOAD_SIZE_MB} MB.")
        
    repo_name = file.filename.replace('.zip', '')
    
    # Save uploaded file
    os.makedirs(settings.UPLOAD_DIRECTORY, exist_ok=True)
    temp_path = os.path.join(settings.UPLOAD_DIRECTORY, f"{uuid.uuid4()}_{file.filename}")
    
    try:
        with open(temp_path, 'wb') as f:
            shutil.copyfileobj(file.file, f)
            
        # Process and store
        repo = await process_and_store_repository(db, current_user.id, repo_name, temp_path)
        return repo
    finally:
        if settings.DELETE_UPLOADED_ZIP_AFTER_INDEXING and os.path.exists(temp_path):
            os.remove(temp_path)

@router.get("", response_model=List[RepositoryResponse])
async def list_repositories(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Repository).where(Repository.user_id == current_user.id)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/{id}", response_model=RepositoryDetailResponse)
async def get_repository(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Repository).where(Repository.id == id, Repository.user_id == current_user.id)
    result = await db.execute(stmt)
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    
    # Get file count
    file_count_stmt = select(func.count()).select_from(DBFile).where(DBFile.repository_id == id)
    file_count = (await db.execute(file_count_stmt)).scalar() or 0
    
    # Get chunk count
    chunk_count_stmt = select(func.count()).select_from(Chunk).where(Chunk.repository_id == id)
    chunk_count = (await db.execute(chunk_count_stmt)).scalar() or 0
    
    # Get languages
    lang_stmt = select(DBFile.language).where(DBFile.repository_id == id).distinct()
    langs = (await db.execute(lang_stmt)).scalars().all()
    languages = [l for l in langs if l]

    return {
        "id": repo.id,
        "name": repo.name,
        "github_url": repo.github_url,
        "user_id": repo.user_id,
        "status": repo.status,
        "error_message": repo.error_message,
        "upload_date": repo.upload_date,
        "file_count": file_count,
        "chunk_count": chunk_count,
        "languages": languages
    }

@router.get("/{id}/files", response_model=List[FileResponse])
async def get_repository_files(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify ownership
    repo = await get_repository(id, current_user, db)
    
    stmt = select(DBFile).where(DBFile.repository_id == repo.id)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/{id}/files/{file_id}/content")
async def get_file_content(
    id: uuid.UUID,
    file_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify repo
    repo = await get_repository(id, current_user, db)
    
    stmt = select(DBFile).where(DBFile.id == file_id, DBFile.repository_id == id)
    file_obj = (await db.execute(stmt)).scalar_one_or_none()
    
    if not file_obj:
        raise HTTPException(status_code=404, detail="File not found")
        
    return {
        "filename": file_obj.path.split("/")[-1],
        "language": file_obj.language,
        "content": file_obj.content
    }

@router.get("/{id}/chunks", response_model=List[ChunkResponse])
async def get_repository_chunks(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify ownership
    repo = await get_repository(id, current_user, db)
    
    stmt = select(Chunk).where(Chunk.repository_id == repo.id)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_repository(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    repo = await get_repository(id, current_user, db)
    
    stmt = select(Repository).where(Repository.id == id, Repository.user_id == current_user.id)
    result = await db.execute(stmt)
    repo_obj = result.scalar_one_or_none()
    if repo_obj:
        await db.delete(repo_obj)
        await db.commit()

@router.post("/{id}/reindex", response_model=RepositoryResponse)
async def reindex_repository(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Repository).where(Repository.id == id, Repository.user_id == current_user.id)
    result = await db.execute(stmt)
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
        
    update_stmt = select(Chunk).where(Chunk.repository_id == id)
    chunks_result = await db.execute(update_stmt)
    for chunk in chunks_result.scalars():
        chunk.embedding = None
        chunk.embedding_model = None
        chunk.embedding_created_at = None
        
    repo.status = "embedding"
    repo.error_message = None
    await db.commit()
    
    asyncio.create_task(generate_embeddings_for_repo(repo.id))
    
    await db.refresh(repo)
    return repo


@router.post("/{id}/ask", response_model=AskResponse)
async def ask_repository_question(
    id: uuid.UUID,
    request: AskRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify ownership
    stmt = select(Repository).where(Repository.id == id, Repository.user_id == current_user.id)
    result = await db.execute(stmt)
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
        
    sources_data = await retrieve_relevant_chunks(db, id, request.question, top_k=8)
    
    file_paths = list(set([source['path'] for source in sources_data]))
    
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

    try:
        if not settings.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is not configured")
            
        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        response = client.models.generate_content(
            model=settings.CHAT_MODEL,
            contents=prompt,
        )
        return AskResponse(answer=response.text, sources=sources_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
