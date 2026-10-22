import os
import sys
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool
from app.core.config import settings

# Create async engine for SQLAlchemy
# Use NullPool during testing so asyncpg connections are closed after each session
# and not reused across pytest-asyncio's per-test event loops.
engine_kwargs = {"echo": False, "pool_pre_ping": True}
if "pytest" in sys.modules or os.environ.get("PYTEST_CURRENT_TEST") or settings.ENVIRONMENT == "test":
    engine_kwargs["poolclass"] = NullPool

engine = create_async_engine(settings.DATABASE_URL, **engine_kwargs)

# Session local class
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
