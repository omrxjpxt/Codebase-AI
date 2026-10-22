import logging
import time
from typing import Optional, List, Dict, Any, AsyncGenerator, Union

import httpx
from google import genai
from google.genai import types
from google.genai.errors import APIError
from fastapi import HTTPException, status
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception

from app.core.config import settings

logger = logging.getLogger(__name__)


def is_retryable_gemini_error(exc: BaseException) -> bool:
    """Return True only for transient errors that can succeed on retry."""
    if isinstance(exc, APIError):
        # 429: rate limit, 500/502/503/504: server overloaded or temporary outage
        return exc.code in {429, 500, 502, 503, 504}
    if isinstance(exc, (httpx.TimeoutException, httpx.NetworkError)):
        return True
    return False


class GeminiService:
    _instance: Optional['GeminiService'] = None
    _client: Optional[genai.Client] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(GeminiService, cls).__new__(cls)
        return cls._instance

    def _get_client(self) -> genai.Client:
        if not self._client:
            if not settings.GEMINI_API_KEY or not settings.GEMINI_API_KEY.strip():
                raise ValueError("GEMINI_API_KEY is not configured")
            self._client = genai.Client(api_key=settings.GEMINI_API_KEY.strip())
        return self._client

    def _validate_embedding_dimension(self, embedding: List[float]) -> None:
        expected = settings.EMBEDDING_DIMENSIONS
        if not isinstance(embedding, (list, tuple)) or len(embedding) != expected:
            actual = len(embedding) if isinstance(embedding, (list, tuple)) else type(embedding).__name__
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Embedding dimension mismatch: expected {expected}, got {actual}"
            )

    def _handle_api_error(self, e: Exception) -> None:
        """Translates underlying exceptions to appropriate FastAPI HTTPExceptions."""
        if isinstance(e, HTTPException):
            raise e

        if isinstance(e, ValueError) and "GEMINI_API_KEY is not configured" in str(e):
            logger.error("Attempted to call Gemini API but GEMINI_API_KEY is missing.")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="AI services are not configured on this server. Please add an API key."
            )

        if isinstance(e, APIError):
            msg = e.message or ""
            if e.code in (401, 403) or (e.code == 400 and ("API key" in msg or "API_KEY" in msg)):
                logger.error(f"Invalid GEMINI_API_KEY provided: {msg}")
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="AI services are improperly configured (Invalid API Key)."
                )
            elif e.code == 429:
                logger.warning(f"Gemini API rate limit exceeded: {msg}")
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="AI service rate limit exceeded. Please try again later."
                )
            elif e.code in (500, 502, 503, 504):
                logger.error(f"Gemini API transient server error {e.code}: {msg}")
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=f"AI service temporarily unavailable ({e.code}). Please try again."
                )
            else:
                logger.error(f"Gemini API Error {e.code}: {msg}")
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"AI service error ({e.code}): {msg}"
                )

        if isinstance(e, (httpx.TimeoutException, httpx.NetworkError)):
            logger.error(f"Gemini API network timeout/error: {e}")
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="AI service request timed out. Please try again."
            )

        logger.exception("Unexpected error in GeminiService")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred while communicating with the AI service: {str(e)}"
        )

    @retry(
        wait=wait_exponential(multiplier=1, min=1, max=8),
        stop=stop_after_attempt(3),
        retry=retry_if_exception(is_retryable_gemini_error),
        reraise=True
    )
    async def _embed_contents_raw(
        self, 
        contents: Union[str, List[str]], 
        model: str
    ) -> types.EmbedContentResponse:
        client = self._get_client()
        start_time = time.time()
        response = await client.aio.models.embed_content(
            model=model,
            contents=contents
        )
        duration = time.time() - start_time
        num_items = len(contents) if isinstance(contents, list) else 1
        logger.info(f"Gemini API embed_content generated {num_items} embedding(s) in {duration:.2f}s")
        return response

    async def embed_contents_batch(
        self, 
        texts: List[str], 
        model: str = settings.EMBEDDING_MODEL
    ) -> List[List[float]]:
        if not texts:
            return []
        try:
            response = await self._embed_contents_raw(contents=texts, model=model)
            if not response or not response.embeddings:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Empty embedding response returned by AI service."
                )
            if len(response.embeddings) != len(texts):
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Embedding batch count mismatch: expected {len(texts)}, got {len(response.embeddings)}"
                )
            result: List[List[float]] = []
            for emb in response.embeddings:
                values = emb.values
                self._validate_embedding_dimension(values)
                result.append(values)
            return result
        except Exception as e:
            self._handle_api_error(e)

    async def embed_content(
        self, 
        text: str, 
        model: str = settings.EMBEDDING_MODEL
    ) -> List[float]:
        batch_result = await self.embed_contents_batch([text], model=model)
        return batch_result[0]

    @retry(
        wait=wait_exponential(multiplier=1, min=1, max=8),
        stop=stop_after_attempt(3),
        retry=retry_if_exception(is_retryable_gemini_error),
        reraise=True
    )
    async def _generate_content_raw(
        self, 
        contents: Any, 
        model: str, 
        config: Optional[Dict[str, Any]] = None
    ) -> types.GenerateContentResponse:
        client = self._get_client()
        start_time = time.time()
        response = await client.aio.models.generate_content(
            model=model,
            contents=contents,
            config=config
        )
        duration = time.time() - start_time
        logger.info(f"Gemini API generate_content completed in {duration:.2f}s")
        return response

    async def generate_content(
        self, 
        contents: Any, 
        model: str = settings.CHAT_MODEL, 
        config: Optional[Dict[str, Any]] = None
    ) -> str:
        try:
            response = await self._generate_content_raw(contents=contents, model=model, config=config)
            return response.text or ""
        except Exception as e:
            self._handle_api_error(e)

    async def generate_content_stream(
        self, 
        contents: Any, 
        model: str = settings.CHAT_MODEL, 
        config: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[str, None]:
        try:
            client = self._get_client()
            logger.info("Gemini API generate_content_stream initializing")
            response = await client.aio.models.generate_content_stream(
                model=model,
                contents=contents,
                config=config
            )
            async for chunk in response:
                if chunk.text:
                    yield chunk.text
        except Exception as e:
            self._handle_api_error(e)


gemini_service = GeminiService()
