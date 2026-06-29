from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routers import auth, repositories

app = FastAPI(
    title="CodeBase AI API",
    description="Backend API for CodeBase AI repository understanding platform.",
    version="1.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict to frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(repositories.router)

@app.get("/")
async def root():
    return {"message": "Welcome to CodeBase AI API"}
