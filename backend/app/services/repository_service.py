import uuid
import time
import logging
import asyncio
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from fastapi import HTTPException

from app.models.repository import Repository
from app.models.file import File
from app.models.chunk import Chunk
from app.services.file_processor import extract_and_scan_zip
from app.services.chunking import chunk_file
from app.services.gemini_service import gemini_service
from app.db.database import AsyncSessionLocal
from app.core.config import settings

logger = logging.getLogger(__name__)

BATCH_SIZE = 25

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
        
        # Extract key configuration files
        config_contents = ""
        key_files = {"package.json", "requirements.txt", "pyproject.toml", "README.md", "docker-compose.yml"}
        for f in files:
            if f.path.split("/")[-1] in key_files:
                config_contents += f"\n\n--- {f.path} ---\n{f.content[:2000]}"
                
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
        
        # 1. Fetch repo
        stmt = select(Repository).where(Repository.id == repo_id)
        result = await db.execute(stmt)
        repo = result.scalar_one_or_none()
        
        if not repo:
            logger.error(f"Cannot generate embeddings: Repository {repo_id} not found.")
            return
            
        repo.status = "indexing"
        repo.error_message = None
        await db.commit()
        
        try:
            # 2. Get all chunks for this repo that don't have embeddings yet
            chunk_stmt = (
                select(Chunk)
                .where(Chunk.repository_id == repo_id, Chunk.embedding.is_(None))
                .order_by(Chunk.id)
            )
            chunk_results = await db.execute(chunk_stmt)
            chunks = list(chunk_results.scalars().all())
            
            if not chunks:
                # Check total chunks count for this repo
                total_stmt = select(func.count()).select_from(Chunk).where(Chunk.repository_id == repo_id)
                total_count = (await db.execute(total_stmt)).scalar() or 0
                
                # Verify if any unembedded chunks exist
                unembedded_stmt = select(func.count()).select_from(Chunk).where(
                    Chunk.repository_id == repo_id,
                    Chunk.embedding.is_(None)
                )
                unembedded_count = (await db.execute(unembedded_stmt)).scalar() or 0
                
                if total_count > 0 and unembedded_count == 0:
                    repo.status = "indexed"
                    repo.error_message = None
                    await db.commit()
                    logger.info(f"Repository {repo_id} already has all {total_count} chunks indexed.")
                else:
                    repo.status = "failed"
                    repo.error_message = "No code chunks available to index in this repository."
                    await db.commit()
                    logger.warning(f"Repository {repo_id} marked failed: 0 chunks available to index.")
                return

            chunks_processed = 0
            total_to_process = len(chunks)
            logger.info(f"Starting batch embedding generation for repo {repo_id}: {total_to_process} chunks to embed.")

            for i in range(0, total_to_process, BATCH_SIZE):
                batch = chunks[i:i + BATCH_SIZE]
                batch_texts = [c.content for c in batch]
                
                # Call batch embedding API via GeminiService
                embeddings = await gemini_service.embed_contents_batch(batch_texts)
                
                if len(embeddings) != len(batch):
                    raise ValueError(f"Batch embedding returned {len(embeddings)} vectors, expected {len(batch)}.")
                    
                now = datetime.now(timezone.utc)
                for chunk, emb in zip(batch, embeddings):
                    chunk.embedding = emb
                    chunk.embedding_model = settings.EMBEDDING_MODEL
                    chunk.embedding_created_at = now
                    chunks_processed += 1
                    
                # Commit progress per batch so partial progress is saved safely
                await db.commit()
                logger.info(f"Embedded {chunks_processed}/{total_to_process} chunks for repo {repo_id}.")
                
            # 3. Double-check that NO chunks remain unembedded before marking indexed
            unembedded_check = select(func.count()).select_from(Chunk).where(
                Chunk.repository_id == repo_id,
                Chunk.embedding.is_(None)
            )
            remaining_unembedded = (await db.execute(unembedded_check)).scalar() or 0
            
            if remaining_unembedded > 0:
                raise ValueError(f"Indexing incomplete: {remaining_unembedded} chunks still lack embeddings.")
                
            duration = time.time() - start_time
            logger.info(f"Embedding generation for repo {repo_id} complete. Processed {chunks_processed} chunks in {duration:.2f}s.")
            
            repo.status = "indexed"
            repo.error_message = None
            await db.commit()
            
            # Fire and forget summary generation if API key is present
            if settings.GEMINI_API_KEY:
                asyncio.create_task(generate_repository_summary(repo_id))

        except Exception as e:
            error_msg = str(e.detail if isinstance(e, HTTPException) else str(e))
            logger.error(f"Failed to generate embeddings for repo {repo_id}: {error_msg}")
            await db.rollback()
            
            # Reload repo and set to failed with clear error message
            stmt = select(Repository).where(Repository.id == repo_id)
            result = await db.execute(stmt)
            repo = result.scalar_one_or_none()
            if repo:
                repo.status = "failed"
                repo.error_message = error_msg
                await db.commit()

async def process_and_store_repository(
    db: AsyncSession, 
    user_id: uuid.UUID, 
    repo_name: str, 
    zip_filepath: str
) -> Repository:
    # 1. Create repository entry
    repo = Repository(user_id=user_id, name=repo_name, status="pending")
    db.add(repo)
    await db.commit()
    await db.refresh(repo)
    repo_id = repo.id
    
    try:
        # 2. Extract and scan files
        extracted_files = extract_and_scan_zip(zip_filepath)
        if not extracted_files:
            raise ValueError("No supported code files found in repository archive.")
        
        # 3. Process each file
        for file_data in extracted_files:
            # Create File entry
            db_file = File(
                repository_id=repo_id,
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
                    repository_id=repo_id,
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
        asyncio.create_task(generate_embeddings_for_repo(repo_id))
        
        await db.refresh(repo)
        return repo
        
    except Exception as e:
        await db.rollback()
        # Mark as failed using saved repo_id
        stmt = select(Repository).where(Repository.id == repo_id)
        result = await db.execute(stmt)
        failed_repo = result.scalar_one_or_none()
        if failed_repo:
            failed_repo.status = "failed"
            failed_repo.error_message = str(e)
            await db.commit()
        raise e
