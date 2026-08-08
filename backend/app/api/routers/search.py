from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.db.database import get_db
from app.models.user import User
from app.models.repository import Repository
from app.models.file import File as DBFile
from app.models.chunk import Chunk
from app.models.chat import ChatSession
from app.api.dependencies import get_current_user

router = APIRouter(prefix="/search", tags=["search"])

@router.get("")
async def global_search(
    q: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not q or len(q.strip()) < 2:
        return {"repositories": [], "files": [], "chunks": [], "chats": []}

    search_term = f"%{q.strip()}%"

    # 1. Search Repositories
    repo_stmt = select(Repository).where(
        Repository.user_id == current_user.id,
        Repository.name.ilike(search_term)
    ).limit(5)
    repo_results = (await db.execute(repo_stmt)).scalars().all()
    repos_list = [{"id": str(r.id), "name": r.name, "type": "repository"} for r in repo_results]

    # Get valid repo ids for scoping files/chunks
    user_repos_stmt = select(Repository.id).where(Repository.user_id == current_user.id)
    user_repo_ids = (await db.execute(user_repos_stmt)).scalars().all()

    files_list = []
    chunks_list = []
    chats_list = []

    if user_repo_ids:
        # 2. Search Files
        file_stmt = select(DBFile, Repository.name).join(Repository).where(
            DBFile.repository_id.in_(user_repo_ids),
            DBFile.path.ilike(search_term)
        ).limit(10)
        file_results = (await db.execute(file_stmt)).all()
        files_list = [{
            "id": str(f.id), 
            "path": f.path, 
            "repository_id": str(f.repository_id), 
            "repository_name": r_name,
            "type": "file"
        } for f, r_name in file_results]

        # 3. Search Chunks (File contents)
        chunk_stmt = select(Chunk, DBFile.path, Repository.name).join(DBFile).join(Repository, DBFile.repository_id == Repository.id).where(
            Chunk.repository_id.in_(user_repo_ids),
            Chunk.content.ilike(search_term)
        ).limit(10)
        chunk_results = (await db.execute(chunk_stmt)).all()
        chunks_list = [{
            "id": str(c.id), 
            "content_preview": c.content[:100] + "...", 
            "path": f_path, 
            "repository_id": str(c.repository_id), 
            "repository_name": r_name,
            "type": "chunk"
        } for c, f_path, r_name in chunk_results]

        # 4. Search Chat Sessions
        chat_stmt = select(ChatSession, Repository.name).join(Repository).where(
            ChatSession.repository_id.in_(user_repo_ids),
            ChatSession.title.ilike(search_term)
        ).limit(5)
        chat_results = (await db.execute(chat_stmt)).all()
        chats_list = [{
            "id": str(c.id), 
            "title": c.title, 
            "repository_id": str(c.repository_id),
            "repository_name": r_name,
            "type": "chat"
        } for c, r_name in chat_results]

    return {
        "repositories": repos_list,
        "files": files_list,
        "chunks": chunks_list,
        "chats": chats_list
    }
