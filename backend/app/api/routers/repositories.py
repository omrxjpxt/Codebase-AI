import os
import shutil
import tempfile
import uuid
import asyncio
from typing import List
from pydantic import BaseModel
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
from app.services.repository_service import process_and_store_repository, generate_embeddings_for_repo, get_repository_readiness
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
        try:
            repo = await process_and_store_repository(db, current_user.id, repo_name, temp_path)
            return repo
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(status_code=500, detail=str(e))
    finally:
        if settings.DELETE_UPLOADED_ZIP_AFTER_INDEXING and os.path.exists(temp_path):
            os.remove(temp_path)

class GithubImportRequest(BaseModel):
    github_url: str

@router.post("/github-import", response_model=RepositoryResponse, status_code=status.HTTP_201_CREATED)
async def import_github_repository(
    request: GithubImportRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    from app.services.github_service import download_github_repo
    
    try:
        temp_path = await download_github_repo(request.github_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    repo_name = request.github_url.rstrip('/').split('/')[-1]
    
    try:
        # Process and store
        try:
            repo = await process_and_store_repository(db, current_user.id, repo_name, temp_path)
            repo.github_url = request.github_url
            await db.commit()
            return repo
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(status_code=500, detail=str(e))
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
    repos = result.scalars().all()
    
    response_list = []
    for repo in repos:
        readiness = await get_repository_readiness(db, repo)
        file_count_stmt = select(func.count()).select_from(DBFile).where(DBFile.repository_id == repo.id)
        file_count = (await db.execute(file_count_stmt)).scalar() or 0
        response_list.append({
            "id": repo.id,
            "name": repo.name,
            "github_url": repo.github_url,
            "user_id": repo.user_id,
            "status": readiness["status"],
            "error_message": repo.error_message,
            "summary": repo.summary,
            "upload_date": repo.upload_date,
            "file_count": file_count,
            "chunk_count": readiness["total_chunks"],
            "indexed_chunk_count": readiness["indexed_chunks"],
            "is_indexed": readiness["is_indexed"],
        })
    return response_list

async def get_repository_model_or_404(
    id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession
) -> Repository:
    stmt = select(Repository).where(Repository.id == id, Repository.user_id == user_id)
    result = await db.execute(stmt)
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")
    return repo

@router.get("/{id}", response_model=RepositoryDetailResponse)
async def get_repository(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    repo = await get_repository_model_or_404(id, current_user.id, db)
    readiness = await get_repository_readiness(db, repo)
    
    # Get file count
    file_count_stmt = select(func.count()).select_from(DBFile).where(DBFile.repository_id == id)
    file_count = (await db.execute(file_count_stmt)).scalar() or 0
    
    # Get languages
    lang_stmt = select(DBFile.language).where(DBFile.repository_id == id).distinct()
    langs = (await db.execute(lang_stmt)).scalars().all()
    languages = [l for l in langs if l]

    return {
        "id": repo.id,
        "name": repo.name,
        "github_url": repo.github_url,
        "user_id": repo.user_id,
        "status": readiness["status"],
        "error_message": repo.error_message,
        "summary": repo.summary,
        "upload_date": repo.upload_date,
        "file_count": file_count,
        "chunk_count": readiness["total_chunks"],
        "indexed_chunk_count": readiness["indexed_chunks"],
        "is_indexed": readiness["is_indexed"],
        "languages": languages
    }

@router.get("/{id}/files", response_model=List[FileResponse])
async def get_repository_files(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify ownership
    repo = await get_repository_model_or_404(id, current_user.id, db)
    
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
    # Verify repo ownership
    repo = await get_repository_model_or_404(id, current_user.id, db)
    
    stmt = select(DBFile).where(DBFile.id == file_id, DBFile.repository_id == repo.id)
    file_obj = (await db.execute(stmt)).scalar_one_or_none()
    
    if not file_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
        
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
    repo = await get_repository_model_or_404(id, current_user.id, db)
    
    stmt = select(Chunk).where(Chunk.repository_id == repo.id)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_repository(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    repo = await get_repository_model_or_404(id, current_user.id, db)
    await db.delete(repo)
    await db.commit()

@router.post("/{id}/reindex", response_model=RepositoryResponse)
async def reindex_repository(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    repo = await get_repository_model_or_404(id, current_user.id, db)
    
    if repo.status == "indexing":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Repository is currently being indexed. Please wait until indexing completes."
        )
        
    # Preserve valid active-model embeddings! Only reset chunks with stale or incompatible models
    stale_stmt = select(Chunk).where(
        Chunk.repository_id == id,
        Chunk.embedding.isnot(None),
        Chunk.embedding_model != settings.EMBEDDING_MODEL
    )
    stale_result = await db.execute(stale_stmt)
    for chunk in stale_result.scalars():
        chunk.embedding = None
        chunk.embedding_model = None
        chunk.embedding_created_at = None
        
    repo.status = "indexing"
    repo.error_message = None
    await db.commit()
    
    asyncio.create_task(generate_embeddings_for_repo(repo.id))
    
    file_count_stmt = select(func.count()).select_from(DBFile).where(DBFile.repository_id == id)
    file_count = (await db.execute(file_count_stmt)).scalar() or 0
    readiness = await get_repository_readiness(db, repo)
    
    return {
        "id": repo.id,
        "name": repo.name,
        "github_url": repo.github_url,
        "user_id": repo.user_id,
        "status": "indexing",
        "error_message": repo.error_message,
        "summary": repo.summary,
        "upload_date": repo.upload_date,
        "file_count": file_count,
        "chunk_count": readiness["total_chunks"],
        "indexed_chunk_count": readiness["indexed_chunks"],
        "is_indexed": False,
    }


@router.post("/{id}/generate-summary", response_model=RepositoryResponse)
async def generate_repository_summary_endpoint(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    repo = await get_repository_model_or_404(id, current_user.id, db)
        
    if not settings.GEMINI_API_KEY:
        raise HTTPException(status_code=400, detail="GEMINI_API_KEY is not configured")
        
    from app.services.repository_service import generate_repository_summary
    asyncio.create_task(generate_repository_summary(repo.id))
    
    return repo


@router.post("/{id}/ask", response_model=AskResponse)
async def ask_repository_question(
    id: uuid.UUID,
    request: AskRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify ownership
    repo = await get_repository_model_or_404(id, current_user.id, db)
    
    if repo.status in ("pending", "processing", "indexing"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Repository is currently indexing. Please wait until indexing completes."
        )
    if repo.status == "failed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Repository indexing failed: {repo.error_message or 'Unknown error'}. Please re-index."
        )
        
    readiness = await get_repository_readiness(db, repo)
    if readiness["indexed_chunks"] == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Repository has not been indexed yet. Please trigger indexing before asking questions."
        )
        
    sources_data = await retrieve_relevant_chunks(db, id, request.question, top_k=8)
    
    file_paths = list(set([source['path'] for source in sources_data]))
    chunks_text = "\n\n".join([f"--- File: {s['path']} ---\n{s['content']}" for s in sources_data])
    
    indexing_notice = ""
    if not readiness["is_indexed"]:
        indexing_notice = f"\nNote: Codebase is partially indexed ({readiness['indexed_chunks']}/{readiness['total_chunks']} chunks). Context is limited to indexed code."

    prompt = f"""You are a senior software engineer helping a developer understand a codebase.

Repository:
{repo.name} ({readiness['indexed_chunks']}/{readiness['total_chunks']} chunks indexed){indexing_notice}

Relevant Files:
{', '.join(file_paths) if file_paths else 'No matching code files found.'}

Relevant Code Context:
{chunks_text if chunks_text else 'No code context retrieved from this repository. Answer using general software engineering knowledge while indicating that no relevant code chunks were found.'}

User Question:
{request.question}

Provide:

1. Overview
2. Relevant Files
3. Explanation
4. Next Steps (if applicable)"""

    try:
        from app.services.gemini_service import gemini_service
        response_text = await gemini_service.generate_content(
            model=settings.CHAT_MODEL,
            contents=prompt,
        )
        return AskResponse(answer=response_text, sources=sources_data)
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))
