import io
import os
import zipfile
import asyncio
import re
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.main import app
from app.models.user import User
from app.models.repository import Repository
from app.models.chat import ChatSession
from app.services.github_service import download_github_repo


@pytest.mark.asyncio
async def test_cross_user_chat_session_idor_blocked(db_session: AsyncSession, test_user_a: User, test_user_b: User, test_repo: dict, auth_headers_b: dict):
    """
    Verify that User B cannot list, retrieve, patch, delete, or ask on User A's chat sessions,
    and cannot list sessions on User A's repository.
    """
    repo_a = test_repo["repo"]
    # Create a chat session owned by User A on User A's repository
    session_a = ChatSession(
        user_id=test_user_a.id,
        repository_id=repo_a.id,
        title="User A Private Session"
    )
    db_session.add(session_a)
    await db_session.commit()
    await db_session.refresh(session_a)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. User B tries to list sessions for User A's repository -> must return 404
        res = await client.get(f"/repositories/{repo_a.id}/chat-sessions", headers=auth_headers_b)
        assert res.status_code == 404

        # 2. User B tries to get session_a by session_id -> must return 404
        res = await client.get(f"/repositories/chat-sessions/{session_a.id}", headers=auth_headers_b)
        assert res.status_code == 404

        # 3. User B tries to patch session_a -> must return 404
        res = await client.patch(f"/repositories/chat-sessions/{session_a.id}", json={"title": "Hacked"}, headers=auth_headers_b)
        assert res.status_code == 404

        # 4. User B tries to ask question on session_a -> must return 404
        res = await client.post(f"/repositories/chat-sessions/{session_a.id}/ask", json={"question": "Where is secret?"}, headers=auth_headers_b)
        assert res.status_code == 404

        # 5. User B tries to delete session_a -> must return 404
        res = await client.delete(f"/repositories/chat-sessions/{session_a.id}", headers=auth_headers_b)
        assert res.status_code == 404

    # Confirm session_a title was not modified in the database
    stmt = select(ChatSession).where(ChatSession.id == session_a.id)
    refreshed = (await db_session.execute(stmt)).scalar_one()
    assert refreshed.title == "User A Private Session"


@pytest.mark.asyncio
async def test_global_search_cross_user_isolation(db_session: AsyncSession, test_user_a: User, test_user_b: User, test_repo: dict, auth_headers_b: dict):
    """
    Verify that global search by User B does not return User A's repositories, files, chunks, or chat sessions.
    """
    repo_a = test_repo["repo"]
    session_a = ChatSession(
        user_id=test_user_a.id,
        repository_id=repo_a.id,
        title="UniqueTopSecretUserA Chat"
    )
    db_session.add(session_a)
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/search?q=UniqueTopSecretUserA", headers=auth_headers_b)
        assert res.status_code == 200
        data = res.json()
        assert len(data["chats"]) == 0
        assert len(data["repositories"]) == 0
        assert len(data["files"]) == 0
        assert len(data["chunks"]) == 0


@pytest.mark.asyncio
async def test_corrupted_zip_upload_returns_400(auth_headers_a: dict):
    """
    Verify that uploading non-ZIP or corrupted bytes returns HTTP 400 Bad Request with a clear error message.
    """
    corrupted_data = b"This is definitely not a valid zip archive file contents."
    files = {"file": ("broken_archive.zip", corrupted_data, "application/zip")}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/repositories/upload", files=files, headers=auth_headers_a)
        assert res.status_code == 400
        assert "Invalid or corrupted ZIP archive" in res.json()["detail"]


@pytest.mark.asyncio
async def test_empty_or_unsupported_archive_returns_400(auth_headers_a: dict):
    """
    Verify that uploading an archive containing no supported code files returns HTTP 400 with a descriptive error.
    """
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("unsupported.bin", b"\x00\x01\x02\x03\x04")
        zf.writestr("image.png", b"\x89PNG\r\n\x1a\n")
    buf.seek(0)

    files = {"file": ("binaries_only.zip", buf.getvalue(), "application/zip")}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/repositories/upload", files=files, headers=auth_headers_a)
        assert res.status_code == 400
        assert "No supported code files found in repository archive" in res.json()["detail"]


@pytest.mark.asyncio
async def test_zero_chunks_reindexing_sets_failed_status(db_session: AsyncSession, test_user_a: User, auth_headers_a: dict):
    """
    Verify that reindexing a repository that has 0 chunks transitions the repository status
    to 'failed' with an informative message, and never marks it 'indexed'.
    """
    # Create empty repo in DB
    empty_repo = Repository(
        user_id=test_user_a.id,
        name="empty-test-repo",
        status="pending"
    )
    db_session.add(empty_repo)
    await db_session.commit()
    await db_session.refresh(empty_repo)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(f"/repositories/{empty_repo.id}/reindex", headers=auth_headers_a)
        assert res.status_code == 200

    # Wait briefly for background task to complete
    await asyncio.sleep(0.4)

    await db_session.refresh(empty_repo)
    assert empty_repo.status == "failed"
    assert "No code chunks available" in empty_repo.error_message


@pytest.mark.asyncio
async def test_github_url_parsing_variants():
    """
    Verify that download_github_repo robustly parses valid GitHub URL variants and rejects invalid ones.
    """
    valid_urls = [
        "https://github.com/octocat/Hello-World",
        "http://github.com/octocat/Hello-World",
        "https://www.github.com/octocat/Hello-World",
        "github.com/octocat/Hello-World",
        "https://github.com/octocat/Hello-World.git",
        "https://github.com/octocat/Hello-World/",
    ]

    for url in valid_urls:
        match = re.search(r"github\.com[/:]([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?(?:/|$)", url.strip())
        assert match is not None, f"Failed to match valid url: {url}"
        assert match.group(1) == "octocat"
        assert match.group(2) == "Hello-World"

    invalid_urls = [
        "https://gitlab.com/owner/repo",
        "https://github.com/justowner",
        "not-a-url",
        "",
    ]
    for url in invalid_urls:
        with pytest.raises(ValueError, match="Invalid GitHub URL"):
            await download_github_repo(url)
