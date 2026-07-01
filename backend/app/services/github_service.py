import os
import uuid
import httpx
import tempfile
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

async def download_github_repo(url: str) -> str:
    """
    Downloads a public GitHub repository as a ZIP archive.
    URL format expected: https://github.com/{owner}/{repo}
    Returns the path to the downloaded ZIP file.
    """
    url = url.strip()
    if url.endswith(".git"):
        url = url[:-4]
    
    parts = url.replace("https://github.com/", "").strip("/").split("/")
    if len(parts) < 2:
        raise ValueError("Invalid GitHub URL. Must be in format: https://github.com/owner/repo")
        
    owner, repo = parts[0], parts[1]
    
    # GitHub zipball API endpoint for the default branch (main/master)
    api_url = f"https://api.github.com/repos/{owner}/{repo}/zipball"
    
    # Save uploaded file
    os.makedirs(settings.UPLOAD_DIRECTORY, exist_ok=True)
    temp_path = os.path.join(settings.UPLOAD_DIRECTORY, f"{uuid.uuid4()}_{repo}.zip")
    
    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            # Add basic headers (User-Agent is required by GitHub API)
            headers = {"User-Agent": "CodeBase-AI"}
            
            async with client.stream("GET", api_url, headers=headers) as response:
                if response.status_code == 404:
                    raise ValueError(f"Repository not found or is private: {url}")
                if response.status_code != 200:
                    raise ValueError(f"Failed to download repository: HTTP {response.status_code}")
                
                with open(temp_path, "wb") as f:
                    async for chunk in response.aiter_bytes(chunk_size=8192):
                        f.write(chunk)
                        
        return temp_path
    except httpx.RequestError as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        logger.error(f"Error downloading GitHub repo {url}: {e}")
        raise ValueError("Network error while downloading the repository")
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise e
