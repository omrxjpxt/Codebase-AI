from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.logging import setup_logging, RequestIDMiddleware
from app.core.config import settings

setup_logging()

from app.api.routers import auth, repositories, chat

app = FastAPI(
    title="CodeBase AI API",
    description="Backend API for CodeBase AI repository understanding platform.",
    version="1.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.CORS_ORIGINS.split(',')],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.api.routers import auth, repositories, chat

# Include routers
app.add_middleware(RequestIDMiddleware)
app.include_router(auth.router)
app.include_router(repositories.router)
app.include_router(chat.router)

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
