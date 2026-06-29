import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.repository import Repository
from app.models.file import File
from app.models.chunk import Chunk
from app.services.file_processor import extract_and_scan_zip
from app.services.chunking import chunk_file

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
                size=file_data["size"]
            )
            db.add(db_file)
            await db.flush() # To get db_file.id
            
            # Create Chunks
            chunks = chunk_file(file_data["content"])
            for i, chunk_text in enumerate(chunks):
                db_chunk = Chunk(
                    repository_id=repo.id,
                    file_id=db_file.id,
                    content=chunk_text,
                    metadata_={"chunk_index": i, "path": file_data["path"]}
                )
                db.add(db_chunk)
                
        # 4. Mark as completed
        repo.status = "completed"
        await db.commit()
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
            await db.commit()
        raise e
