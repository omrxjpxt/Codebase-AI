import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi import HTTPException
import httpx
from google.genai.errors import APIError
from google.genai import types

from app.core.config import settings
from app.services.gemini_service import GeminiService, is_retryable_gemini_error


def test_is_retryable_gemini_error():
    # Transient errors -> True
    assert is_retryable_gemini_error(APIError(429, {"error": {"message": "Rate limit"}})) is True
    assert is_retryable_gemini_error(APIError(500, {"error": {"message": "Server error"}})) is True
    assert is_retryable_gemini_error(APIError(503, {"error": {"message": "Unavailable"}})) is True
    assert is_retryable_gemini_error(httpx.TimeoutException("Request timed out")) is True
    assert is_retryable_gemini_error(httpx.NetworkError("Network down")) is True

    # Permanent errors -> False
    assert is_retryable_gemini_error(APIError(400, {"error": {"message": "Bad request"}})) is False
    assert is_retryable_gemini_error(APIError(401, {"error": {"message": "Unauthorized"}})) is False
    assert is_retryable_gemini_error(APIError(403, {"error": {"message": "Forbidden"}})) is False
    assert is_retryable_gemini_error(APIError(404, {"error": {"message": "Not found"}})) is False
    assert is_retryable_gemini_error(ValueError("GEMINI_API_KEY is not configured")) is False


@pytest.mark.asyncio
async def test_missing_api_key_raises_503():
    service = GeminiService()
    # Ensure fresh client state
    service._client = None
    
    with patch.object(settings, "GEMINI_API_KEY", None):
        with pytest.raises(HTTPException) as exc_info:
            await service.embed_content("test text")
        assert exc_info.value.status_code == 503
        assert "AI services are not configured" in exc_info.value.detail


@pytest.mark.asyncio
async def test_invalid_api_key_translates_to_503():
    service = GeminiService()
    service._client = MagicMock()

    with patch.object(service, "_embed_contents_raw", side_effect=APIError(401, {"error": {"message": "Invalid API Key"}})):
        with pytest.raises(HTTPException) as exc_info:
            await service.embed_content("test text")
        assert exc_info.value.status_code == 503
        assert "Invalid API Key" in exc_info.value.detail


@pytest.mark.asyncio
async def test_rate_limit_translates_to_429():
    service = GeminiService()
    service._client = MagicMock()

    with patch.object(service, "_embed_contents_raw", side_effect=APIError(429, {"error": {"message": "Quota exceeded"}})):
        with pytest.raises(HTTPException) as exc_info:
            await service.embed_contents_batch(["chunk 1", "chunk 2"])
        assert exc_info.value.status_code == 429
        assert "rate limit exceeded" in exc_info.value.detail


@pytest.mark.asyncio
async def test_dimension_validation_enforces_768():
    service = GeminiService()
    service._client = MagicMock()

    # Create mock response with incorrect dimensions (e.g. 512 instead of 768)
    mock_emb = MagicMock()
    mock_emb.values = [0.1] * 512
    mock_resp = MagicMock()
    mock_resp.embeddings = [mock_emb]

    with patch.object(service, "_embed_contents_raw", return_value=mock_resp):
        with pytest.raises(HTTPException) as exc_info:
            await service.embed_contents_batch(["sample chunk text"])
        assert exc_info.value.status_code == 502
        assert "Embedding dimension mismatch: expected 768, got 512" in exc_info.value.detail


@pytest.mark.asyncio
async def test_batch_embedding_preserves_order_and_mapping():
    service = GeminiService()
    service._client = MagicMock()

    emb_1 = [0.01] * 768
    emb_2 = [0.02] * 768
    
    mock_item_1 = MagicMock()
    mock_item_1.values = emb_1
    mock_item_2 = MagicMock()
    mock_item_2.values = emb_2
    
    mock_resp = MagicMock()
    mock_resp.embeddings = [mock_item_1, mock_item_2]

    with patch.object(service, "_embed_contents_raw", return_value=mock_resp):
        result = await service.embed_contents_batch(["code chunk 1", "code chunk 2"])
        assert len(result) == 2
        assert result[0] == emb_1
        assert result[1] == emb_2


@pytest.mark.asyncio
async def test_empty_batch_returns_empty_without_api_call():
    service = GeminiService()
    with patch.object(service, "_embed_contents_raw") as mock_raw:
        result = await service.embed_contents_batch([])
        assert result == []
        mock_raw.assert_not_called()
