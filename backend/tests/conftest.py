import uuid
import pytest_asyncio
from datetime import timedelta
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool

from app.main import app
from app.db.database import get_db
from app.models.user import User
from app.models.repository import Repository
from app.models.file import File
from app.models.chunk import Chunk
from app.auth.security import get_password_hash, create_access_token
from app.core.config import settings

# Use NullPool for tests so asyncpg connections are not shared across event loops
test_engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
TestSessionLocal = async_sessionmaker(test_engine, expire_on_commit=False, class_=AsyncSession)

async def override_get_db():
    async with TestSessionLocal() as session:
        yield session

app.dependency_overrides[get_db] = override_get_db

@pytest_asyncio.fixture
async def db_session():
    async with TestSessionLocal() as session:
        yield session

@pytest_asyncio.fixture
async def test_user_a():
    unique_id = uuid.uuid4().hex[:8]
    user_id = uuid.uuid4()
    async with TestSessionLocal() as session:
        user = User(
            id=user_id,
            email=f"test_a_{unique_id}@test.local",
            password_hash=get_password_hash("TestPassword123!")
        )
        session.add(user)
        await session.commit()

    yield user

    # Teardown: delete test user (cascades to all user's test records)
    async with TestSessionLocal() as session:
        stmt = select(User).where(User.id == user_id)
        existing = (await session.execute(stmt)).scalar_one_or_none()
        if existing:
            await session.delete(existing)
            await session.commit()

@pytest_asyncio.fixture
async def test_user_b():
    unique_id = uuid.uuid4().hex[:8]
    user_id = uuid.uuid4()
    async with TestSessionLocal() as session:
        user = User(
            id=user_id,
            email=f"test_b_{unique_id}@test.local",
            password_hash=get_password_hash("TestPassword123!")
        )
        session.add(user)
        await session.commit()

    yield user

    # Teardown
    async with TestSessionLocal() as session:
        stmt = select(User).where(User.id == user_id)
        existing = (await session.execute(stmt)).scalar_one_or_none()
        if existing:
            await session.delete(existing)
            await session.commit()

@pytest_asyncio.fixture
def auth_headers_a(test_user_a):
    token = create_access_token(
        data={"sub": test_user_a.email},
        expires_delta=timedelta(minutes=60)
    )
    return {"Authorization": f"Bearer {token}"}

@pytest_asyncio.fixture
def auth_headers_b(test_user_b):
    token = create_access_token(
        data={"sub": test_user_b.email},
        expires_delta=timedelta(minutes=60)
    )
    return {"Authorization": f"Bearer {token}"}

@pytest_asyncio.fixture
async def test_repo(test_user_a):
    repo_id = uuid.uuid4()
    file_id = uuid.uuid4()
    chunk_id = uuid.uuid4()

    async with TestSessionLocal() as session:
        repo = Repository(
            id=repo_id,
            user_id=test_user_a.id,
            name="test-fixture-repo",
            status="indexed",
            summary="Test repository summary description"
        )
        session.add(repo)
        await session.commit()

        file_obj = File(
            id=file_id,
            repository_id=repo.id,
            path="src/main.py",
            language="Python",
            size=45,
            content="def main():\n    return 'codebase-ai test'\n"
        )
        session.add(file_obj)
        await session.commit()

        chunk_obj = Chunk(
            id=chunk_id,
            repository_id=repo.id,
            file_id=file_obj.id,
            content="def main():\n    return 'codebase-ai test'\n",
            embedding=[0.05] * 768,
            embedding_model=settings.EMBEDDING_MODEL,
            metadata_={
                "chunk_index": 0,
                "path": "src/main.py",
                "start_line": 1,
                "end_line": 2
            }
        )
        session.add(chunk_obj)
        await session.commit()

    yield {
        "repo": repo,
        "file": file_obj,
        "chunk": chunk_obj
    }

@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
