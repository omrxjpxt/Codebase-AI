import uuid
import time
import logging
import asyncio
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from google import genai

from app.models.repository import Repository
from app.models.file import File
from app.models.chunk import Chunk
from app.services.file_processor import extract_and_scan_zip
from app.services.chunking import chunk_file
from app.services.retrieval_service import generate_query_embedding
from app.db.database import AsyncSessionLocal
from app.core.config import settings

logger = logging.getLogger(__name__)

async def generate_repository_summary(repo_id: uuid.UUID):
    async with AsyncSessionLocal() as db:
        stmt = select(Repository).where(Repository.id == repo_id)
        repo = (await db.execute(stmt)).scalar_one_or_none()
        if not repo or not settings.GEMINI_API_KEY:
            return
            
        # Get file paths to understand project structure
        file_stmt = select(File.path, File.content).where(File.repository_id == repo_id)
        files = (await db.execute(file_stmt)).all()
        
        tree = [f.path for f in files]
        
        # Optionally extract key configuration files (package.json, pyproject.toml, etc.)
        config_contents = ""
        key_files = {"package.json", "requirements.txt", "pyproject.toml", "README.md", "docker-compose.yml"}
        for f in files:
            if f.path.split("/")[-1] in key_files:
                config_contents += f"\n\n--- {f.path} ---\n{f.content[:2000]}" # Limiting size per config file
                
        prompt = f"""You are an expert software architect. Provide a high-level summary of the following repository.
        
Repository Name: {repo.name}

File Structure:
{chr(10).join(tree[:200])} {len(tree) > 200 and '... (truncated)' or ''}

Key Files (Partial):
{config_contents}

Please output a comprehensive Markdown summary including:
- **Project Overview** (what the project is)
- **Tech Stack** (languages, frameworks, databases inferred)
- **Architecture Overview**
- **Main Folders** and their purposes
- **Entry Points**
- **External Services** / Configurations detected
"""
        try:
            from app.services.gemini_service import gemini_service
            response_text = await gemini_service.generate_content(
                model=settings.CHAT_MODEL,
                contents=prompt,
            )
            
            repo.summary = response_text
            await db.commit()
            logger.info(f"Summary generated for repo {repo_id}")
        except Exception as e:
            logger.error(f"Failed to generate summary for repo {repo_id}: {e}")
            await db.rollback()

async def generate_embeddings_for_repo(repo_id: uuid.UUID):
    async with AsyncSessionLocal() as db:
        start_time = time.time()
        
        # Get repo
        stmt = select(Repository).where(Repository.id == repo_id)
        result = await db.execute(stmt)
        repo = result.scalar_one_or_none()
        
        if not repo:
            return
            
        repo.status = "embedding"
        await db.commit()
        
        try:
            # Get all chunks for this repo that don't have embeddings yet
            chunk_stmt = select(Chunk).where(Chunk.repository_id == repo_id, Chunk.embedding.is_(None))
            chunk_results = await db.execute(chunk_stmt)
            chunks = chunk_results.scalars().all()
            
            chunks_processed = 0
            for chunk in chunks:
                embedding = await generate_query_embedding(chunk.content)
                chunk.embedding = embedding
                chunk.embedding_model = settings.EMBEDDING_MODEL
                chunk.embedding_created_at = datetime.now(timezone.utc)
                chunks_processed += 1
                
                # Commit every 50 chunks to save progress
                if chunks_processed % 50 == 0:
                    await db.commit()
                    
            await db.commit()
            
            duration = time.time() - start_time
            logger.info(f"Embedding generation for repo {repo_id} complete. Processed {chunks_processed} chunks in {duration:.2f}s.")
            
            repo.status = "indexed"
            repo.error_message = None
            await db.commit()
            
            # Fire and forget summary generation if API key is present
            if settings.GEMINI_API_KEY:
                asyncio.create_task(generate_repository_summary(repo_id))
            
        except Exception as e:
            logger.error(f"Failed to generate embeddings for repo {repo_id}: {e}")
            await db.rollback()
            
            # Reload repo and set to failed
            stmt = select(Repository).where(Repository.id == repo_id)
            result = await db.execute(stmt)
            repo = result.scalar_one_or_none()
            if repo:
                repo.status = "failed"
                repo.error_message = str(e)
                await db.commit()

async def process_and_store_repository(
    db: AsyncSession, 
    user_id: uuid.UUID, 
    repo_name: str, 
    zip_filepath: str
) -> Repository:
    # 1. Create repository entry
    repo = Repository(user_id=user_id, name=repo_name, status="processing")
    db.add(repo)
    await db.commit()
    await db.refresh(repo)
    
    try:
        # 2. Extract and scan files
        extracted_files = extract_and_scan_zip(zip_filepath)
        
        # 3. Process each file
        for file_data in extracted_files:
            # Create File entry
            db_file = File(
                repository_id=repo.id,
                path=file_data["path"],
                language=file_data["language"],
                size=file_data["size"],
                content=file_data["content"]
            )
            db.add(db_file)
            await db.flush() # To get db_file.id
            
            # Create Chunks
            chunks = chunk_file(file_data["content"])
            for i, chunk_data in enumerate(chunks):
                db_chunk = Chunk(
                    repository_id=repo.id,
                    file_id=db_file.id,
                    content=chunk_data["content"],
                    metadata_={
                        "chunk_index": i, 
                        "path": file_data["path"],
                        "start_line": chunk_data["start_line"],
                        "end_line": chunk_data["end_line"]
                    }
                )
                db.add(db_chunk)
                
        await db.commit()
        
        # 4. Generate embeddings in background
        asyncio.create_task(generate_embeddings_for_repo(repo.id))
        
        await db.refresh(repo)
        return repo
        
    except Exception as e:
        await db.rollback()
        # Mark as failed
        stmt = select(Repository).where(Repository.id == repo.id)
        result = await db.execute(stmt)
        failed_repo = result.scalar_one_or_none()
        if failed_repo:
            failed_repo.status = "failed"
            failed_repo.error_message = str(e)
            await db.commit()
        raise e
