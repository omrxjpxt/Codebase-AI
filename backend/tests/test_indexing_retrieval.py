import uuid
import pytest
from unittest.mock import patch
from sqlalchemy import select

from app.models.repository import Repository
from app.models.file import File
from app.models.chunk import Chunk
from app.services.repository_service import generate_embeddings_for_repo
from app.services.retrieval_service import retrieve_relevant_chunks
from tests.conftest import TestSessionLocal


@pytest.mark.asyncio
async def test_indexing_status_lifecycle_and_batch_persistence(test_user_a):
    repo_id = uuid.uuid4()
    file_id = uuid.uuid4()
    chunk1_id = uuid.uuid4()
    chunk2_id = uuid.uuid4()

    async with TestSessionLocal() as session:
        repo = Repository(
            id=repo_id,
            user_id=test_user_a.id,
            name="test-batch-indexing-repo",
            status="pending"
        )
        session.add(repo)
        
        file_obj = File(
            id=file_id,
            repository_id=repo_id,
            path="src/calc.py",
            language="Python",
            size=100,
            content="def add(a, b):\n    return a + b\n\ndef sub(a, b):\n    return a - b\n"
        )
        session.add(file_obj)
        
        chunk1 = Chunk(
            id=chunk1_id,
            repository_id=repo_id,
            file_id=file_id,
            content="def add(a, b):\n    return a + b\n",
            metadata_={"chunk_index": 0, "path": "src/calc.py", "start_line": 1, "end_line": 2}
        )
        chunk2 = Chunk(
            id=chunk2_id,
            repository_id=repo_id,
            file_id=file_id,
            content="def sub(a, b):\n    return a - b\n",
            metadata_={"chunk_index": 1, "path": "src/calc.py", "start_line": 4, "end_line": 5}
        )
        session.add_all([chunk1, chunk2])
        await session.commit()

    try:
        # Mock batch embedding returning valid 768-dim embeddings
        mock_emb = [[0.05] * 768, [0.08] * 768]
        with patch("app.services.gemini_service.gemini_service.embed_contents_batch", return_value=mock_emb):
            await generate_embeddings_for_repo(repo_id)

        async with TestSessionLocal() as session:
            stmt = select(Repository).where(Repository.id == repo_id)
            updated_repo = (await session.execute(stmt)).scalar_one()
            assert updated_repo.status == "indexed"
            assert updated_repo.error_message is None

            chunks_stmt = select(Chunk).where(Chunk.repository_id == repo_id)
            persisted_chunks = (await session.execute(chunks_stmt)).scalars().all()
            assert len(persisted_chunks) == 2
            for c in persisted_chunks:
                assert c.embedding is not None
                assert len(c.embedding) == 768
                assert c.embedding_model == "text-embedding-004"
                assert c.embedding_created_at is not None
    finally:
        async with TestSessionLocal() as session:
            stmt = select(Repository).where(Repository.id == repo_id)
            r = (await session.execute(stmt)).scalar_one_or_none()
            if r:
                await session.delete(r)
                await session.commit()


@pytest.mark.asyncio
async def test_indexing_failure_sets_failed_status_and_error_message(test_user_a):
    repo_id = uuid.uuid4()
    file_id = uuid.uuid4()
    chunk_id = uuid.uuid4()

    async with TestSessionLocal() as session:
        repo = Repository(
            id=repo_id,
            user_id=test_user_a.id,
            name="test-fail-indexing-repo",
            status="pending"
        )
        session.add(repo)
        
        file_obj = File(
            id=file_id,
            repository_id=repo_id,
            path="main.py",
            language="Python",
            size=30,
            content="print('fail test')"
        )
        session.add(file_obj)
        
        chunk = Chunk(
            id=chunk_id,
            repository_id=repo_id,
            file_id=file_id,
            content="print('fail test')",
            metadata_={"chunk_index": 0, "path": "main.py", "start_line": 1, "end_line": 1}
        )
        session.add(chunk)
        await session.commit()

    try:
        from fastapi import HTTPException
        simulated_error = HTTPException(status_code=503, detail="AI services are not configured on this server. Please add an API key.")
        
        with patch("app.services.gemini_service.gemini_service.embed_contents_batch", side_effect=simulated_error):
            await generate_embeddings_for_repo(repo_id)

        async with TestSessionLocal() as session:
            stmt = select(Repository).where(Repository.id == repo_id)
            failed_repo = (await session.execute(stmt)).scalar_one()
            assert failed_repo.status == "failed"
            assert "AI services are not configured" in failed_repo.error_message
    finally:
        async with TestSessionLocal() as session:
            stmt = select(Repository).where(Repository.id == repo_id)
            r = (await session.execute(stmt)).scalar_one_or_none()
            if r:
                await session.delete(r)
                await session.commit()


@pytest.mark.asyncio
async def test_safe_reindexing_and_concurrent_guard(client, auth_headers_a, test_repo):
    repo = test_repo["repo"]
    
    # 1. Trigger reindex
    response = await client.post(f"/repositories/{repo.id}/reindex", headers=auth_headers_a)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "indexing"
    assert data["error_message"] is None

    # 2. When repository is indexing, a second concurrent reindex call should be rejected with 409 Conflict
    conflict_response = await client.post(f"/repositories/{repo.id}/reindex", headers=auth_headers_a)
    assert conflict_response.status_code == 409
    assert "currently being indexed" in conflict_response.json()["detail"]

    # Reset repository back to indexed for cleanup
    async with TestSessionLocal() as session:
        stmt = select(Repository).where(Repository.id == repo.id)
        r = (await session.execute(stmt)).scalar_one()
        r.status = "indexed"
        await session.commit()


@pytest.mark.asyncio
async def test_vector_retrieval_with_pgvector_similarity(test_user_a):
    repo_id = uuid.uuid4()
    file_id = uuid.uuid4()
    chunk_id = uuid.uuid4()

    test_vector = [0.0] * 768
    test_vector[0] = 1.0  # Unit vector along dimension 0

    async with TestSessionLocal() as session:
        repo = Repository(
            id=repo_id,
            user_id=test_user_a.id,
            name="test-pgvector-repo",
            status="indexed"
        )
        session.add(repo)
        
        file_obj = File(
            id=file_id,
            repository_id=repo_id,
            path="src/vector_test.py",
            language="Python",
            size=50,
            content="def vector_feature():\n    return 'vector search success'\n"
        )
        session.add(file_obj)
        
        chunk = Chunk(
            id=chunk_id,
            repository_id=repo_id,
            file_id=file_id,
            content="def vector_feature():\n    return 'vector search success'\n",
            embedding=test_vector,
            embedding_model="text-embedding-004",
            metadata_={"chunk_index": 0, "path": "src/vector_test.py", "start_line": 1, "end_line": 2}
        )
        session.add(chunk)
        await session.commit()

    try:
        async with TestSessionLocal() as session:
            # Query vector close to unit vector along dim 0
            query_vector = [0.0] * 768
            query_vector[0] = 0.99
            query_vector[1] = 0.05
            
            with patch("app.services.retrieval_service.generate_query_embedding", return_value=query_vector):
                sources = await retrieve_relevant_chunks(session, repo_id, "how does vector_feature work?", top_k=5)
                assert len(sources) == 1
                assert sources[0]["path"] == "src/vector_test.py"
                assert "vector_feature" in sources[0]["content"]
                assert sources[0]["score"] > 0.95
                assert sources[0]["start_line"] == 1
                assert sources[0]["end_line"] == 2
    finally:
        async with TestSessionLocal() as session:
            stmt = select(Repository).where(Repository.id == repo_id)
            r = (await session.execute(stmt)).scalar_one_or_none()
            if r:
                await session.delete(r)
                await session.commit()


@pytest.mark.asyncio
async def test_ask_endpoint_blocks_indexing_and_failed_repositories(client, auth_headers_a, test_user_a):
    repo_id = uuid.uuid4()

    async with TestSessionLocal() as session:
        repo = Repository(
            id=repo_id,
            user_id=test_user_a.id,
            name="test-unready-repo",
            status="indexing"
        )
        session.add(repo)
        await session.commit()

    try:
        # 1. Calling ask while indexing should return 400
        res = await client.post(
            f"/repositories/{repo_id}/ask",
            headers=auth_headers_a,
            json={"question": "What does this repo do?"}
        )
        assert res.status_code == 400
        assert "currently indexing" in res.json()["detail"]

        # 2. Transition to failed
        async with TestSessionLocal() as session:
            stmt = select(Repository).where(Repository.id == repo_id)
            r = (await session.execute(stmt)).scalar_one()
            r.status = "failed"
            r.error_message = "Quota exceeded"
            await session.commit()

        # Calling ask while failed should return 400 with failure reason
        res_fail = await client.post(
            f"/repositories/{repo_id}/ask",
            headers=auth_headers_a,
            json={"question": "What does this repo do?"}
        )
        assert res_fail.status_code == 400
        assert "Repository indexing failed" in res_fail.json()["detail"]
    finally:
        async with TestSessionLocal() as session:
            stmt = select(Repository).where(Repository.id == repo_id)
            r = (await session.execute(stmt)).scalar_one_or_none()
            if r:
                await session.delete(r)
                await session.commit()
