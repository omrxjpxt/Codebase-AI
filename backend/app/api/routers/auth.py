from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.responses import RedirectResponse
import httpx
import secrets
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserResponse
from app.schemas.token import Token
from app.auth.security import verify_password, get_password_hash, create_access_token
from app.core.config import settings
from app.api.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check if user exists
    stmt = select(User).where(User.email == user_in.email)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = get_password_hash(user_in.password)
    new_user = User(email=user_in.email, password_hash=hashed_password)
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user

@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    stmt = select(User).where(User.email == form_data.username)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.delete(current_user)
    await db.commit()

@router.get("/github/login")
async def github_login(response: Response):
    if not settings.GITHUB_CLIENT_ID:
        raise HTTPException(status_code=500, detail="GitHub Client ID not configured")
        
    state = secrets.token_urlsafe(32)
    
    github_auth_url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={settings.GITHUB_CLIENT_ID}"
        f"&redirect_uri={settings.GITHUB_REDIRECT_URI}"
        f"&scope=user:email"
        f"&state={state}"
    )
    
    redirect = RedirectResponse(url=github_auth_url)
    redirect.set_cookie(
        key="github_oauth_state",
        value=state,
        httponly=True,
        max_age=600,
        secure=settings.ENVIRONMENT != "development",
        samesite="lax",
        path="/"
    )
    return redirect

@router.get("/github/callback")
async def github_callback(request: Request, db: AsyncSession = Depends(get_db), code: str = None, state: str = None, error: str = None):
    if error:
        raise HTTPException(status_code=400, detail=f"GitHub OAuth error: {error}")
        
    oauth_state = request.cookies.get("github_oauth_state")
    if not oauth_state or not state:
        raise HTTPException(status_code=400, detail="Missing OAuth state")
        
    if not secrets.compare_digest(oauth_state, state):
        raise HTTPException(status_code=400, detail="Invalid state parameter")
        
    if not settings.GITHUB_CLIENT_ID or not settings.GITHUB_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="GitHub OAuth not configured")
        
    async with httpx.AsyncClient() as client:
        # Get access token
        token_res = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.GITHUB_CLIENT_ID,
                "client_secret": settings.GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": settings.GITHUB_REDIRECT_URI,
            }
        )
        token_data = token_res.json()
        access_token = token_data.get("access_token")
        
        if not access_token:
            raise HTTPException(status_code=400, detail="Could not authenticate with GitHub")
            
        # Get user email
        email_res = await client.get(
            "https://api.github.com/user/emails",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github.v3+json",
            }
        )
        
        if email_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch GitHub emails")
            
        emails = email_res.json()
        primary_email = None
        for email_obj in emails:
            if email_obj.get("primary") and email_obj.get("verified"):
                primary_email = email_obj.get("email")
                break
                
        if not primary_email:
            for email_obj in emails:
                if email_obj.get("verified"):
                    primary_email = email_obj.get("email")
                    break
                    
        if not primary_email:
            raise HTTPException(status_code=400, detail="No verified email found on GitHub account")
            
    stmt = select(User).where(User.email == primary_email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if not user:
        hashed_password = get_password_hash(secrets.token_urlsafe(32))
        user = User(email=primary_email, password_hash=hashed_password)
        db.add(user)
        await db.commit()
        await db.refresh(user)
        
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    jwt_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    
    frontend_redirect = RedirectResponse(url=f"{settings.FRONTEND_URL}/dashboard")
    frontend_redirect.set_cookie(
        key="access_token",
        value=jwt_token,
        httponly=True,
        secure=settings.ENVIRONMENT != "development",
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )
    frontend_redirect.delete_cookie("github_oauth_state", path="/")
    
    return frontend_redirect
