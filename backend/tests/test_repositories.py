import uuid
import pytest

@pytest.mark.asyncio
async def test_get_repository_contract(client, auth_headers_a, test_repo):
    repo_id = str(test_repo["repo"].id)
    response = await client.get(f"/repositories/{repo_id}", headers=auth_headers_a)
    
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == repo_id
    assert data["name"] == "test-fixture-repo"
    assert data["status"] == "indexed"
    assert data["file_count"] == 1
    assert data["chunk_count"] == 1
    assert "Python" in data["languages"]
    assert data["summary"] == "Test repository summary description"

@pytest.mark.asyncio
async def test_get_repository_files(client, auth_headers_a, test_repo):
    repo_id = str(test_repo["repo"].id)
    response = await client.get(f"/repositories/{repo_id}/files", headers=auth_headers_a)
    
    assert response.status_code == 200
    files = response.json()
    assert isinstance(files, list)
    assert len(files) == 1
    assert files[0]["path"] == "src/main.py"
    assert files[0]["language"] == "Python"
    assert files[0]["id"] == str(test_repo["file"].id)

@pytest.mark.asyncio
async def test_get_file_content(client, auth_headers_a, test_repo):
    repo_id = str(test_repo["repo"].id)
    file_id = str(test_repo["file"].id)
    response = await client.get(f"/repositories/{repo_id}/files/{file_id}/content", headers=auth_headers_a)
    
    assert response.status_code == 200
    data = response.json()
    assert data["filename"] == "main.py"
    assert data["language"] == "Python"
    assert "codebase-ai test" in data["content"]

@pytest.mark.asyncio
async def test_get_repository_chunks(client, auth_headers_a, test_repo):
    repo_id = str(test_repo["repo"].id)
    response = await client.get(f"/repositories/{repo_id}/chunks", headers=auth_headers_a)
    
    assert response.status_code == 200
    chunks = response.json()
    assert isinstance(chunks, list)
    assert len(chunks) == 1
    assert "codebase-ai test" in chunks[0]["content"]
    assert chunks[0]["repository_id"] == repo_id

@pytest.mark.asyncio
async def test_missing_repository_returns_404(client, auth_headers_a):
    non_existent_id = str(uuid.uuid4())
    response = await client.get(f"/repositories/{non_existent_id}", headers=auth_headers_a)
    assert response.status_code == 404
    assert response.json()["detail"] == "Repository not found"

@pytest.mark.asyncio
async def test_missing_file_content_returns_404(client, auth_headers_a, test_repo):
    repo_id = str(test_repo["repo"].id)
    non_existent_file_id = str(uuid.uuid4())
    response = await client.get(
        f"/repositories/{repo_id}/files/{non_existent_file_id}/content",
        headers=auth_headers_a
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "File not found"

@pytest.mark.asyncio
async def test_unauthenticated_access_returns_401(client, test_repo):
    repo_id = str(test_repo["repo"].id)
    # No Authorization header
    response = await client.get(f"/repositories/{repo_id}")
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_cross_user_ownership_isolation(client, auth_headers_b, test_repo):
    # User B tries to view User A's repository
    repo_id = str(test_repo["repo"].id)
    response = await client.get(f"/repositories/{repo_id}", headers=auth_headers_b)
    # Should return 404 because repo does not belong to User B
    assert response.status_code == 404
    assert response.json()["detail"] == "Repository not found"

    # User B tries to list files of User A's repo
    files_response = await client.get(f"/repositories/{repo_id}/files", headers=auth_headers_b)
    assert files_response.status_code == 404

    # User B tries to delete User A's repo
    delete_response = await client.delete(f"/repositories/{repo_id}", headers=auth_headers_b)
    assert delete_response.status_code == 404

@pytest.mark.asyncio
async def test_delete_repository_owned(client, auth_headers_a, test_user_a):
    from app.models.repository import Repository
    from tests.conftest import TestSessionLocal
    repo_id = uuid.uuid4()
    async with TestSessionLocal() as session:
        disposable_repo = Repository(
            id=repo_id,
            user_id=test_user_a.id,
            name="disposable-repo-to-delete",
            status="pending"
        )
        session.add(disposable_repo)
        await session.commit()

    # Delete via endpoint
    response = await client.delete(f"/repositories/{str(repo_id)}", headers=auth_headers_a)
    assert response.status_code == 204

    # Confirm it's gone
    confirm_res = await client.get(f"/repositories/{str(repo_id)}", headers=auth_headers_a)
    assert confirm_res.status_code == 404

