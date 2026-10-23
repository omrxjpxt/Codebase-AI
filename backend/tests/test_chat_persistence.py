import uuid
import json
import pytest
from unittest.mock import patch, MagicMock
from sqlalchemy import select

from app.models.chat import ChatSession, Message
from tests.conftest import TestSessionLocal


@pytest.mark.asyncio
async def test_message_sources_persistence_and_serialization(client, auth_headers_a, test_user_a, test_repo):
    repo = test_repo["repo"]
    session_id = uuid.uuid4()
    user_msg_id = uuid.uuid4()
    assistant_msg_id = uuid.uuid4()

    mock_sources = [
        {
            "chunk_id": str(uuid.uuid4()),
            "file": "calc.py",
            "file_id": str(uuid.uuid4()),
            "path": "src/calc.py",
            "content": "def add(a, b):\n    return a + b\n",
            "score": 0.942,
            "chunk_index": 0,
            "start_line": 1,
            "end_line": 2
        }
    ]

    async with TestSessionLocal() as db:
        chat_sess = ChatSession(
            id=session_id,
            user_id=test_user_a.id,
            repository_id=repo.id,
            title="Persistence Test Chat"
        )
        db.add(chat_sess)
        await db.commit()

        user_msg = Message(
            id=user_msg_id,
            chat_session_id=session_id,
            role="user",
            content="How does add work?",
            sources=None
        )
        assistant_msg = Message(
            id=assistant_msg_id,
            chat_session_id=session_id,
            role="assistant",
            content="The add function adds two numbers.",
            sources=mock_sources
        )
        db.add_all([user_msg, assistant_msg])
        await db.commit()

    try:
        # Retrieve session via API
        response = await client.get(
            f"/repositories/chat-sessions/{session_id}",
            headers=auth_headers_a
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(session_id)
        assert len(data["messages"]) == 2

        # Verify user message has null sources
        msg_user = next(m for m in data["messages"] if m["role"] == "user")
        assert msg_user["sources"] is None

        # Verify assistant message has persisted sources
        msg_assistant = next(m for m in data["messages"] if m["role"] == "assistant")
        assert msg_assistant["sources"] is not None
        assert len(msg_assistant["sources"]) == 1
        source_item = msg_assistant["sources"][0]
        assert source_item["path"] == "src/calc.py"
        assert source_item["file"] == "calc.py"
        assert source_item["start_line"] == 1
        assert source_item["end_line"] == 2
        assert source_item["score"] == 0.942
    finally:
        async with TestSessionLocal() as db:
            stmt = select(ChatSession).where(ChatSession.id == session_id)
            sess = (await db.execute(stmt)).scalar_one_or_none()
            if sess:
                await db.delete(sess)
                await db.commit()


@pytest.mark.asyncio
async def test_streaming_ask_persists_assistant_message_with_sources(client, auth_headers_a, test_user_a, test_repo):
    repo = test_repo["repo"]
    session_id = uuid.uuid4()

    mock_sources = [
        {
            "chunk_id": str(uuid.uuid4()),
            "file": "main.py",
            "file_id": str(test_repo["file"].id),
            "path": "src/main.py",
            "content": "def main(): return 'test'",
            "score": 0.91,
            "chunk_index": 0,
            "start_line": 1,
            "end_line": 2
        }
    ]

    async with TestSessionLocal() as db:
        chat_sess = ChatSession(
            id=session_id,
            user_id=test_user_a.id,
            repository_id=repo.id,
            title="Streaming Persistence Test"
        )
        db.add(chat_sess)
        await db.commit()

    async def fake_stream(*args, **kwargs):
        yield "This is "
        yield "the assistant "
        yield "response."

    try:
        with patch("app.api.routers.chat.retrieve_relevant_chunks", return_value=mock_sources), \
             patch("app.services.gemini_service.gemini_service.generate_content_stream", side_effect=fake_stream):
            
            response = await client.post(
                f"/repositories/chat-sessions/{session_id}/ask",
                headers=auth_headers_a,
                json={"question": "What does main do?"}
            )
            assert response.status_code == 200
            
            # Read NDJSON streamed chunks
            lines = response.text.strip().split("\n")
            parsed_lines = [json.loads(line) for line in lines if line.strip()]

            # First event is sources
            assert parsed_lines[0]["type"] == "sources"
            assert len(parsed_lines[0]["data"]) == 1
            assert parsed_lines[0]["data"][0]["path"] == "src/main.py"

            # Subsequent events are text chunks
            text_chunks = [p["text"] for p in parsed_lines if p.get("type") == "chunk"]
            assert "".join(text_chunks) == "This is the assistant response."

        # Verify assistant message was persisted in PostgreSQL with sources
        async with TestSessionLocal() as db:
            msg_stmt = (
                select(Message)
                .where(Message.chat_session_id == session_id, Message.role == "assistant")
            )
            assistant_msg = (await db.execute(msg_stmt)).scalar_one()
            assert assistant_msg.content == "This is the assistant response."
            assert assistant_msg.sources is not None
            assert len(assistant_msg.sources) == 1
            assert assistant_msg.sources[0]["path"] == "src/main.py"
    finally:
        async with TestSessionLocal() as db:
            stmt = select(ChatSession).where(ChatSession.id == session_id)
            sess = (await db.execute(stmt)).scalar_one_or_none()
            if sess:
                await db.delete(sess)
                await db.commit()
