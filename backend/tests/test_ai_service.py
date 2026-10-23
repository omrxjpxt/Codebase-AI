import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi import HTTPException
import httpx
from google.genai.errors import APIError
from google.genai import types

from app.core.config import settings
from app.services.gemini_service import (
    GeminiService, 
    is_retryable_gemini_error,
    format_code_chunk_for_embedding,
    format_query_for_embedding
)


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


@pytest.mark.asyncio
async def test_embed_contents_raw_configures_output_dimensionality():
    service = GeminiService()
    mock_client = MagicMock()
    mock_aio = MagicMock()
    mock_models = MagicMock()
    mock_aio.models = mock_models
    mock_client.aio = mock_aio
    service._client = mock_client

    mock_resp = MagicMock()
    mock_models.embed_content = AsyncMock(return_value=mock_resp)

    res = await service._embed_contents_raw("sample text", model="gemini-embedding-2")
    assert res == mock_resp

    mock_models.embed_content.assert_called_once()
    _, kwargs = mock_models.embed_content.call_args
    assert kwargs["model"] == "gemini-embedding-2"
    # Plain string is normalized to a List of types.Content
    contents = kwargs["contents"]
    assert isinstance(contents, list) and len(contents) == 1
    assert isinstance(contents[0], types.Content)
    assert contents[0].parts[0].text == "sample text"
    config = kwargs["config"]
    assert config is not None
    assert config.output_dimensionality == 768


@pytest.mark.asyncio
async def test_embed_contents_batch_builds_separate_content_objects():
    service = GeminiService()
    mock_client = MagicMock()
    mock_aio = MagicMock()
    mock_models = MagicMock()
    mock_aio.models = mock_models
    mock_client.aio = mock_aio
    service._client = mock_client

    emb_1 = MagicMock(values=[0.1] * 768)
    emb_2 = MagicMock(values=[0.2] * 768)
    mock_resp = MagicMock(embeddings=[emb_1, emb_2])
    mock_models.embed_content = AsyncMock(return_value=mock_resp)

    texts = ["def foo(): pass", "def bar(): pass"]
    result = await service.embed_contents_batch(texts)
    assert len(result) == 2
    assert result[0] == [0.1] * 768
    assert result[1] == [0.2] * 768

    mock_models.embed_content.assert_called_once()
    _, kwargs = mock_models.embed_content.call_args
    submitted_contents = kwargs["contents"]
    # Verify each text input was wrapped in its own separate types.Content
    assert isinstance(submitted_contents, list)
    assert len(submitted_contents) == 2
    assert isinstance(submitted_contents[0], types.Content)
    assert isinstance(submitted_contents[1], types.Content)
    assert submitted_contents[0].parts[0].text == "def foo(): pass"
    assert submitted_contents[1].parts[0].text == "def bar(): pass"


@pytest.mark.asyncio
async def test_batch_embedding_fails_on_aggregated_response_count_mismatch():
    service = GeminiService()
    mock_client = MagicMock()
    mock_aio = MagicMock()
    mock_models = MagicMock()
    mock_aio.models = mock_models
    mock_client.aio = mock_aio
    service._client = mock_client

    # When 2 items are submitted, but the provider only returns 1 aggregated embedding
    mock_single_emb = MagicMock(values=[0.1] * 768)
    mock_resp = MagicMock(embeddings=[mock_single_emb])
    mock_models.embed_content = AsyncMock(return_value=mock_resp)

    with pytest.raises(HTTPException) as exc_info:
        await service.embed_contents_batch(["chunk 1", "chunk 2"])
    assert exc_info.value.status_code == 502
    assert "Embedding batch count mismatch: expected 2 distinct embeddings, got 1" in exc_info.value.detail


@pytest.mark.asyncio
async def test_batch_embedding_fails_on_nan_or_inf_embedding():
    service = GeminiService()
    mock_client = MagicMock()
    mock_aio = MagicMock()
    mock_models = MagicMock()
    mock_aio.models = mock_models
    mock_client.aio = mock_aio
    service._client = mock_client

    bad_vector = [0.1] * 767 + [float("nan")]
    mock_emb = MagicMock(values=bad_vector)
    mock_resp = MagicMock(embeddings=[mock_emb])
    mock_models.embed_content = AsyncMock(return_value=mock_resp)

    with pytest.raises(HTTPException) as exc_info:
        await service.embed_contents_batch(["chunk with nan"])
    assert exc_info.value.status_code == 502
    assert "Invalid float value" in exc_info.value.detail


def test_format_code_chunk_for_embedding():
    # Standard file path and code content
    formatted = format_code_chunk_for_embedding("src/utils/math.py", "def add(a, b): return a + b")
    assert formatted == "title: src/utils/math.py | text: def add(a, b): return a + b"

    # None file path falls back to "none"
    formatted_none = format_code_chunk_for_embedding(None, "print('hello')")
    assert formatted_none == "title: none | text: print('hello')"

    # Empty / whitespace file path falls back to "none"
    formatted_empty = format_code_chunk_for_embedding("   ", "print('hello')")
    assert formatted_empty == "title: none | text: print('hello')"


def test_format_query_for_embedding():
    # User question
    formatted = format_query_for_embedding("How does password hashing work?")
    assert formatted == "task: code retrieval | query: How does password hashing work?"

    # Strips surrounding whitespace
    formatted_whitespace = format_query_for_embedding("   where is the JWT router?   ")
    assert formatted_whitespace == "task: code retrieval | query: where is the JWT router?"


