import uuid
import time
import logging
import asyncio
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.repository import Repository
from app.models.file import File
from app.models.chunk import Chunk
from app.services.file_processor import extract_and_scan_zip
from app.services.chunking import chunk_file
from app.services.retrieval_service import generate_query_embedding
from app.db.database import AsyncSessionLocal
from app.core.config import settings

logger = logging.getLogger(__name__)

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
