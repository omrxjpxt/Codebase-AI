import logging
import time
from typing import Optional, List, Dict, Any, AsyncGenerator

from google import genai
from google.genai.errors import APIError
from fastapi import HTTPException, status
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

from app.core.config import settings

logger = logging.getLogger(__name__)

class GeminiService:
    _instance: Optional['GeminiService'] = None
    _client: Optional[genai.Client] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(GeminiService, cls).__new__(cls)
        return cls._instance

    def _get_client(self) -> genai.Client:
        if not self._client:
            if not settings.GEMINI_API_KEY:
                raise ValueError("GEMINI_API_KEY is not configured")
            self._client = genai.Client(api_key=settings.GEMINI_API_KEY)
        return self._client

    def _handle_api_error(self, e: Exception) -> None:
        """Translates underlying genai exceptions to FastAPI HTTPExceptions."""
        if isinstance(e, ValueError) and "GEMINI_API_KEY is not configured" in str(e):
            logger.error("Attempted to call Gemini API but GEMINI_API_KEY is missing.")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="AI services are not configured on this server. Please add an API key."
            )
            
        if isinstance(e, APIError):
            if e.code == 401 or e.code == 403:
                logger.error("Invalid GEMINI_API_KEY provided.")
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="AI services are improperly configured (Invalid API Key)."
                )
            elif e.code == 429:
                logger.warning("Gemini API rate limit exceeded.")
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="AI service rate limit exceeded. Please try again later."
                )
            else:
                logger.error(f"Gemini API Error {e.code}: {e.message}")
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="AI service encountered an unexpected error."
                )
        
        logger.exception("Unexpected error in GeminiService")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while communicating with the AI service."
        )

    @retry(
        wait=wait_exponential(multiplier=1, min=2, max=10),
        stop=stop_after_attempt(3),
        retry=retry_if_exception_type(APIError),
        reraise=True
    )
    async def embed_content(self, text: str, model: str = settings.EMBEDDING_MODEL) -> List[float]:
        try:
            client = self._get_client()
            start_time = time.time()
            response = client.models.embed_content(
                model=model,
                contents=text,
            )
            duration = time.time() - start_time
            logger.info(f"Gemini API embed_content generated in {duration:.2f}s")
            return response.embeddings[0].values
        except Exception as e:
            self._handle_api_error(e)

    @retry(
        wait=wait_exponential(multiplier=1, min=2, max=10),
        stop=stop_after_attempt(3),
        retry=retry_if_exception_type(APIError),
        reraise=True
    )
    async def generate_content(self, contents: Any, model: str = settings.CHAT_MODEL, config: Optional[Dict[str, Any]] = None) -> str:
        try:
            client = self._get_client()
            start_time = time.time()
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=config
            )
            duration = time.time() - start_time
            logger.info(f"Gemini API generate_content completed in {duration:.2f}s")
            return response.text
        except Exception as e:
            self._handle_api_error(e)

    async def generate_content_stream(self, contents: Any, model: str = settings.CHAT_MODEL, config: Optional[Dict[str, Any]] = None) -> AsyncGenerator[str, None]:
        # We don't generally auto-retry streaming responses as the connection is already active,
        # but we do handle initialization errors.
        try:
            client = self._get_client()
            logger.info("Gemini API generate_content_stream initialized")
            response = client.aio.models.generate_content_stream(
                model=model,
                contents=contents,
                config=config
            )
            async for chunk in response:
                yield chunk.text
        except Exception as e:
            self._handle_api_error(e)

gemini_service = GeminiService()
