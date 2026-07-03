import os
import shutil
import logging
from contextlib import asynccontextmanager

# Initialize .env before importing config
env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
env_example_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env.example")
if not os.path.exists(env_path) and os.path.exists(env_example_path):
    shutil.copy(env_example_path, env_path)
    print("Created .env from .env.example")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.logging import setup_logging, RequestIDMiddleware
from app.core.config import settings

setup_logging()
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Validate API key at startup
    if not settings.GEMINI_API_KEY:
        logger.warning("=" * 60)
        logger.warning("GEMINI_API_KEY IS NOT CONFIGURED IN .env!")
        logger.warning("AI features (Chat, Retrieval, Summaries) will fail.")
        logger.warning("Please add GEMINI_API_KEY to backend/.env and restart.")
        logger.warning("=" * 60)
    else:
        try:
            from app.services.gemini_service import gemini_service
            # Light ping to verify the key is valid (list models)
            client = gemini_service._get_client()
            models = client.models.list_models()
            for _ in models:
                pass # Just consume one item to verify auth
            logger.info("GEMINI_API_KEY is valid. AI services are ready.")
        except Exception as e:
            logger.error("=" * 60)
            logger.error("FAILED TO VALIDATE GEMINI_API_KEY!")
            logger.error(f"Error: {e}")
            logger.error("AI features will fail. Please check your API key.")
            logger.error("=" * 60)
            
    yield

from app.api.routers import auth, repositories, chat

app = FastAPI(
    title="CodeBase AI API",
    description="Backend API for CodeBase AI repository understanding platform.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.CORS_ORIGINS.split(',')],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.api.routers import auth, repositories, chat, chat_sessions

# Include routers
app.add_middleware(RequestIDMiddleware)
app.include_router(auth.router)
app.include_router(repositories.router)
app.include_router(chat.router)
app.include_router(chat_sessions.router)

@app.get("/")
async def root():
    return {"message": "Welcome to CodeBase AI API"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.get("/ready")
async def readiness_check():
    # Can be expanded to check DB connection
    return {"status": "ready"}
