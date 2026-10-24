import uuid
import pytest
from unittest.mock import patch
from sqlalchemy import select, func

from app.models.repository import Repository
from app.models.file import File
from app.models.chunk import Chunk
from app.services.repository_service import generate_embeddings_for_repo, get_repository_readiness
from app.services.retrieval_service import retrieve_relevant_chunks, generate_query_embedding
from app.core.config import settings
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
                assert c.embedding_model == settings.EMBEDDING_MODEL
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
            embedding_model=settings.EMBEDDING_MODEL,
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


@pytest.mark.asyncio
async def test_incompatible_embedding_model_isolated_from_retrieval(test_user_a):
    """
    Verify that chunks embedded with an outdated or different embedding model are NOT
    retrieved or mixed into similarity searches with the active model.
    """
    repo_id = uuid.uuid4()
    file_id = uuid.uuid4()
    chunk_id = uuid.uuid4()

    test_vector = [0.0] * 768
    test_vector[0] = 1.0

    async with TestSessionLocal() as session:
        repo = Repository(
            id=repo_id,
            user_id=test_user_a.id,
            name="test-mismatched-model-repo",
            status="indexed"
        )
        session.add(repo)
        
        file_obj = File(
            id=file_id,
            repository_id=repo_id,
            path="src/legacy.py",
            language="Python",
            size=50,
            content="def legacy_code(): pass\n"
        )
        session.add(file_obj)
        
        chunk = Chunk(
            id=chunk_id,
            repository_id=repo_id,
            file_id=file_id,
            content="def legacy_code(): pass\n",
            embedding=test_vector,
            embedding_model="outdated-model-001",
            metadata_={"chunk_index": 0, "path": "src/legacy.py", "start_line": 1, "end_line": 1}
        )
        session.add(chunk)
        await session.commit()

    try:
        async with TestSessionLocal() as session:
            query_vector = [0.0] * 768
            query_vector[0] = 1.0
            
            with patch("app.services.retrieval_service.generate_query_embedding", return_value=query_vector):
                sources = await retrieve_relevant_chunks(session, repo_id, "how does legacy work?", top_k=5)
                # Must be 0 because chunk was embedded with outdated-model-001, not settings.EMBEDDING_MODEL
                assert len(sources) == 0
    finally:
        async with TestSessionLocal() as session:
            stmt = select(Repository).where(Repository.id == repo_id)
            r = (await session.execute(stmt)).scalar_one_or_none()
            if r:
                await session.delete(r)
                await session.commit()


@pytest.mark.asyncio
async def test_reindexing_regenerates_mismatched_model_embeddings(test_user_a):
    """
    Verify that generate_embeddings_for_repo detects chunks with outdated embedding models
    and regenerates embeddings using the active settings.EMBEDDING_MODEL.
    """
    repo_id = uuid.uuid4()
    file_id = uuid.uuid4()
    chunk_id = uuid.uuid4()

    async with TestSessionLocal() as session:
        repo = Repository(
            id=repo_id,
            user_id=test_user_a.id,
            name="test-reembed-repo",
            status="pending"
        )
        session.add(repo)
        
        file_obj = File(
            id=file_id,
            repository_id=repo_id,
            path="src/reembed.py",
            language="Python",
            size=50,
            content="def reembed(): return True\n"
        )
        session.add(file_obj)
        
        # Chunk has an embedding, but from a legacy model
        chunk = Chunk(
            id=chunk_id,
            repository_id=repo_id,
            file_id=file_id,
            content="def reembed(): return True\n",
            embedding=[0.01] * 768,
            embedding_model="legacy-model-old",
            metadata_={"chunk_index": 0, "path": "src/reembed.py", "start_line": 1, "end_line": 1}
        )
        session.add(chunk)
        await session.commit()

    try:
        new_vector = [[0.99] * 768]
        with patch("app.services.gemini_service.gemini_service.embed_contents_batch", return_value=new_vector):
            await generate_embeddings_for_repo(repo_id)

        async with TestSessionLocal() as session:
            stmt = select(Repository).where(Repository.id == repo_id)
            r = (await session.execute(stmt)).scalar_one()
            assert r.status == "indexed"

            chunk_stmt = select(Chunk).where(Chunk.id == chunk_id)
            c = (await session.execute(chunk_stmt)).scalar_one()
            assert c.embedding_model == settings.EMBEDDING_MODEL
            assert list(c.embedding) == [0.99] * 768
    finally:
        async with TestSessionLocal() as session:
            stmt = select(Repository).where(Repository.id == repo_id)
            r = (await session.execute(stmt)).scalar_one_or_none()
            if r:
                await session.delete(r)
                await session.commit()


@pytest.mark.asyncio
async def test_indexing_formats_retrieval_document_and_preserves_raw_chunk_content(test_user_a):
    repo_id = uuid.uuid4()
    file_id = uuid.uuid4()
    chunk_id = uuid.uuid4()

    raw_code = "def authenticate(user, password):\n    return verify(password)\n"

    async with TestSessionLocal() as session:
        repo = Repository(
            id=repo_id,
            user_id=test_user_a.id,
            name="test-format-repo",
            status="pending"
        )
        session.add(repo)
        
        file_obj = File(
            id=file_id,
            repository_id=repo_id,
            path="app/auth/security.py",
            language="Python",
            size=len(raw_code),
            content=raw_code
        )
        session.add(file_obj)
        
        chunk = Chunk(
            id=chunk_id,
            repository_id=repo_id,
            file_id=file_id,
            content=raw_code,
            metadata_={"chunk_index": 0, "path": "app/auth/security.py", "start_line": 1, "end_line": 2}
        )
        session.add(chunk)
        await session.commit()

    try:
        mock_vector = [[0.05] * 768]
        with patch("app.services.gemini_service.gemini_service.embed_contents_batch", return_value=mock_vector) as mock_batch:
            await generate_embeddings_for_repo(repo_id)

        # 1. Verify the formatted string sent to embed_contents_batch
        mock_batch.assert_called_once()
        submitted_texts = mock_batch.call_args[0][0]
        assert len(submitted_texts) == 1
        assert submitted_texts[0] == f"title: app/auth/security.py | text: {raw_code}"

        # 2. Verify Chunk.content in the database was NOT altered and remains raw original code
        async with TestSessionLocal() as session:
            chunk_stmt = select(Chunk).where(Chunk.id == chunk_id)
            c = (await session.execute(chunk_stmt)).scalar_one()
            assert c.content == raw_code
            assert "title: app/auth/security.py" not in c.content
    finally:
        async with TestSessionLocal() as session:
            stmt = select(Repository).where(Repository.id == repo_id)
            r = (await session.execute(stmt)).scalar_one_or_none()
            if r:
                await session.delete(r)
                await session.commit()


@pytest.mark.asyncio
async def test_generate_query_embedding_applies_code_retrieval_task_prefix():
    with patch("app.services.retrieval_service.gemini_service.embed_content", return_value=[0.1] * 768) as mock_embed:
        res = await generate_query_embedding("how to configure database?")
        assert res == [0.1] * 768
        mock_embed.assert_called_once_with(text="task: code retrieval | query: how to configure database?")


@pytest.mark.asyncio
async def test_max_chunks_limit_strictly_enforces_exact_database_writes(test_user_a):
    """Verify that passing max_chunks=N writes exactly N embeddings to DB and sets partially_indexed."""
    repo_id = uuid.uuid4()
    file_id = uuid.uuid4()

    async with TestSessionLocal() as session:
        repo = Repository(
            id=repo_id,
            user_id=test_user_a.id,
            name="test-max-chunks-repo",
            status="completed"
        )
        session.add(repo)
        
        file_obj = File(
            id=file_id,
            repository_id=repo_id,
            path="src/service.py",
            language="Python",
            size=500,
            content="line1\nline2\nline3\nline4\nline5\nline6\n"
        )
        session.add(file_obj)

        chunks = [
            Chunk(
                id=uuid.uuid4(),
                repository_id=repo_id,
                file_id=file_id,
                content=f"chunk_{i}_content",
                metadata_={"chunk_index": i, "path": "src/service.py"}
            )
            for i in range(6)
        ]
        session.add_all(chunks)
        await session.commit()

    try:
        mock_vectors = [[0.1 * i] * 768 for i in range(2)]
        with patch("app.services.gemini_service.gemini_service.embed_contents_batch", return_value=mock_vectors) as mock_batch:
            await generate_embeddings_for_repo(repo_id, max_chunks=2)
            mock_batch.assert_called_once()
            assert len(mock_batch.call_args[0][0]) == 2

        async with TestSessionLocal() as session:
            stmt = select(Repository).where(Repository.id == repo_id)
            updated_repo = (await session.execute(stmt)).scalar_one()
            # Repository must NOT be marked indexed
            assert updated_repo.status == "partially_indexed"

            readiness = await get_repository_readiness(session, updated_repo)
            assert readiness["is_indexed"] is False
            assert readiness["total_chunks"] == 6
            assert readiness["indexed_chunks"] == 2
            assert readiness["missing_chunks"] == 4

            # Verify exact database writes
            embedded_chunks = (await session.execute(
                select(Chunk).where(Chunk.repository_id == repo_id, Chunk.embedding.isnot(None))
            )).scalars().all()
            assert len(embedded_chunks) == 2

            unembedded_chunks = (await session.execute(
                select(Chunk).where(Chunk.repository_id == repo_id, Chunk.embedding.is_(None))
            )).scalars().all()
            assert len(unembedded_chunks) == 4

        # Verify max_chunks=0 performs 0 database writes and 0 API calls
        with patch("app.services.gemini_service.gemini_service.embed_contents_batch") as mock_batch_zero:
            await generate_embeddings_for_repo(repo_id, max_chunks=0)
            mock_batch_zero.assert_not_called()

        async with TestSessionLocal() as session:
            embedded_count = (await session.execute(
                select(func.count()).select_from(Chunk).where(Chunk.repository_id == repo_id, Chunk.embedding.isnot(None))
            )).scalar()
            assert embedded_count == 2
    finally:
        async with TestSessionLocal() as session:
            stmt = select(Repository).where(Repository.id == repo_id)
            r = (await session.execute(stmt)).scalar_one_or_none()
            if r:
                await session.delete(r)
                await session.commit()


@pytest.mark.asyncio
async def test_bounded_indexing_resumes_without_overwriting_or_deleting_existing_vectors(test_user_a):
    """Verify that multiple bounded runs resume from unembedded chunks and preserve existing vectors."""
    repo_id = uuid.uuid4()
    file_id = uuid.uuid4()

    async with TestSessionLocal() as session:
        repo = Repository(
            id=repo_id,
            user_id=test_user_a.id,
            name="test-resumable-repo",
            status="completed"
        )
        session.add(repo)
        
        file_obj = File(
            id=file_id,
            repository_id=repo_id,
            path="src/calc.py",
            language="Python",
            size=300,
            content="def a(): pass\ndef b(): pass\ndef c(): pass\ndef d(): pass\n"
        )
        session.add(file_obj)

        chunk_ids = [uuid.uuid4() for _ in range(4)]
        chunks = [
            Chunk(
                id=cid,
                repository_id=repo_id,
                file_id=file_id,
                content=f"calc_chunk_{i}",
                metadata_={"chunk_index": i, "path": "src/calc.py"}
            )
            for i, cid in enumerate(chunk_ids)
        ]
        session.add_all(chunks)
        await session.commit()

    try:
        # Run 1: embed 2 chunks
        mock_vecs_run1 = [[0.11] * 768, [0.22] * 768]
        with patch("app.services.gemini_service.gemini_service.embed_contents_batch", return_value=mock_vecs_run1):
            await generate_embeddings_for_repo(repo_id, max_chunks=2)

        async with TestSessionLocal() as session:
            r1 = (await session.execute(select(Repository).where(Repository.id == repo_id))).scalar_one()
            assert r1.status == "partially_indexed"

            readiness1 = await get_repository_readiness(session, r1)
            assert readiness1["indexed_chunks"] == 2
            assert readiness1["missing_chunks"] == 2

        # Run 2: embed next 2 chunks (completes the repository)
        mock_vecs_run2 = [[0.33] * 768, [0.44] * 768]
        with patch("app.services.gemini_service.gemini_service.embed_contents_batch", return_value=mock_vecs_run2):
            await generate_embeddings_for_repo(repo_id, max_chunks=2)

        async with TestSessionLocal() as session:
            r2 = (await session.execute(select(Repository).where(Repository.id == repo_id))).scalar_one()
            assert r2.status == "indexed"

            readiness2 = await get_repository_readiness(session, r2)
            assert readiness2["is_indexed"] is True
            assert readiness2["indexed_chunks"] == 4
            assert readiness2["missing_chunks"] == 0

            # Verify that run 1 embeddings were preserved and NOT overwritten
            all_chunks = (await session.execute(
                select(Chunk).where(Chunk.repository_id == repo_id).order_by(Chunk.id)
            )).scalars().all()
            assert len(all_chunks) == 4
            # First two chunks must still have 0.11 and 0.22 vectors
            assert list(all_chunks[0].embedding) == [0.11] * 768
            assert list(all_chunks[1].embedding) == [0.22] * 768
            assert list(all_chunks[2].embedding) == [0.33] * 768
            assert list(all_chunks[3].embedding) == [0.44] * 768
    finally:
        async with TestSessionLocal() as session:
            stmt = select(Repository).where(Repository.id == repo_id)
            r = (await session.execute(stmt)).scalar_one_or_none()
            if r:
                await session.delete(r)
                await session.commit()


@pytest.mark.asyncio
async def test_stale_model_vectors_rejected_by_invariant_and_regenerated_safely(test_user_a):
    """Verify that chunks with older embedding models are identified as incomplete and re-embedded."""
    repo_id = uuid.uuid4()
    file_id = uuid.uuid4()

    async with TestSessionLocal() as session:
        repo = Repository(
            id=repo_id,
            user_id=test_user_a.id,
            name="test-stale-model-repo",
            status="indexed"  # False claim
        )
        session.add(repo)
        
        file_obj = File(
            id=file_id,
            repository_id=repo_id,
            path="src/stale.py",
            language="Python",
            size=200,
            content="def stale(): pass\n"
        )
        session.add(file_obj)

        chunk1 = Chunk(
            id=uuid.uuid4(),
            repository_id=repo_id,
            file_id=file_id,
            content="valid_chunk",
            embedding=[0.5] * 768,
            embedding_model=settings.EMBEDDING_MODEL,
            metadata_={"chunk_index": 0}
        )
        chunk2 = Chunk(
            id=uuid.uuid4(),
            repository_id=repo_id,
            file_id=file_id,
            content="stale_chunk",
            embedding=[0.8] * 768,
            embedding_model="text-embedding-004",  # Stale legacy model
            metadata_={"chunk_index": 1}
        )
        session.add_all([chunk1, chunk2])
        await session.commit()

    try:
        # Invariant check: repository must NOT be considered indexed
        async with TestSessionLocal() as session:
            r = (await session.execute(select(Repository).where(Repository.id == repo_id))).scalar_one()
            readiness = await get_repository_readiness(session, r)
            assert readiness["is_indexed"] is False
            assert readiness["indexed_chunks"] == 1
            assert readiness["stale_chunks"] == 1
            assert readiness["missing_chunks"] == 1
            assert readiness["status"] == "partially_indexed"

        # Re-indexing: only chunk 2 should be submitted to embed_contents_batch
        new_vec = [[0.9] * 768]
        with patch("app.services.gemini_service.gemini_service.embed_contents_batch", return_value=new_vec) as mock_batch:
            await generate_embeddings_for_repo(repo_id)
            mock_batch.assert_called_once()
            # Only 1 chunk submitted
            assert len(mock_batch.call_args[0][0]) == 1

        async with TestSessionLocal() as session:
            r_updated = (await session.execute(select(Repository).where(Repository.id == repo_id))).scalar_one()
            assert r_updated.status == "indexed"

            readiness_updated = await get_repository_readiness(session, r_updated)
            assert readiness_updated["is_indexed"] is True
            assert readiness_updated["indexed_chunks"] == 2
            assert readiness_updated["stale_chunks"] == 0
    finally:
        async with TestSessionLocal() as session:
            stmt = select(Repository).where(Repository.id == repo_id)
            r = (await session.execute(stmt)).scalar_one_or_none()
            if r:
                await session.delete(r)
                await session.commit()


@pytest.mark.asyncio
async def test_api_endpoints_enforce_indexing_readiness_and_honest_partial_state(client, test_user_a, auth_headers_a):
    """Test API readiness behavior across unindexed, failed, indexing, and partially indexed states."""
    repo_id = uuid.uuid4()
    file_id = uuid.uuid4()

    async with TestSessionLocal() as session:
        repo = Repository(
            id=repo_id,
            user_id=test_user_a.id,
            name="test-readiness-api-repo",
            status="completed"  # Ingested, but no embeddings
        )
        session.add(repo)

        file_obj = File(
            id=file_id,
            repository_id=repo_id,
            path="src/api.py",
            language="Python",
            size=100,
            content="def run(): pass\n"
        )
        session.add(file_obj)

        chunk1 = Chunk(
            id=uuid.uuid4(),
            repository_id=repo_id,
            file_id=file_id,
            content="def run(): pass\n",
            metadata_={"chunk_index": 0, "path": "src/api.py"}
        )
        chunk2 = Chunk(
            id=uuid.uuid4(),
            repository_id=repo_id,
            file_id=file_id,
            content="def helper(): pass\n",
            metadata_={"chunk_index": 1, "path": "src/api.py"}
        )
        session.add_all([chunk1, chunk2])
        await session.commit()

    try:
        # 1. Unindexed (0 embeddings): POST /ask must reject with 400
        ask_res = await client.post(
            f"/repositories/{repo_id}/ask",
            headers=auth_headers_a,
            json={"question": "What does run() do?"}
        )
        assert ask_res.status_code == 400
        assert "not been indexed yet" in ask_res.json()["detail"].lower()

        # 2. Currently indexing: POST /ask must reject with 400
        async with TestSessionLocal() as session:
            r = (await session.execute(select(Repository).where(Repository.id == repo_id))).scalar_one()
            r.status = "indexing"
            await session.commit()

        ask_res2 = await client.post(
            f"/repositories/{repo_id}/ask",
            headers=auth_headers_a,
            json={"question": "What does run() do?"}
        )
        assert ask_res2.status_code == 400
        assert "currently indexing" in ask_res2.json()["detail"].lower()

        # 3. Failed: POST /ask must reject with 400
        async with TestSessionLocal() as session:
            r = (await session.execute(select(Repository).where(Repository.id == repo_id))).scalar_one()
            r.status = "failed"
            r.error_message = "Gemini quota exceeded"
            await session.commit()

        ask_res3 = await client.post(
            f"/repositories/{repo_id}/ask",
            headers=auth_headers_a,
            json={"question": "What does run() do?"}
        )
        assert ask_res3.status_code == 400
        assert "indexing failed" in ask_res3.json()["detail"].lower()

        # 4. Partially indexed: embed 1 of 2 chunks
        async with TestSessionLocal() as session:
            c1 = (await session.execute(select(Chunk).where(Chunk.id == chunk1.id))).scalar_one()
            c1.embedding = [0.1] * 768
            c1.embedding_model = settings.EMBEDDING_MODEL
            r = (await session.execute(select(Repository).where(Repository.id == repo_id))).scalar_one()
            r.status = "partially_indexed"
            r.error_message = None
            await session.commit()

        # Check GET /repositories/{id} returns accurate partial status and chunk counts
        get_res = await client.get(f"/repositories/{repo_id}", headers=auth_headers_a)
        assert get_res.status_code == 200
        detail = get_res.json()
        assert detail["status"] == "partially_indexed"
        assert detail["is_indexed"] is False
        assert detail["chunk_count"] == 2
        assert detail["indexed_chunk_count"] == 1

        # Check POST /ask succeeds and includes partial indexing note in prompt
        mock_retrieval = [{
            "chunk_id": str(chunk1.id),
            "file": "api.py",
            "file_id": str(file_id),
            "path": "src/api.py",
            "content": "def run(): pass\n",
            "score": 0.95,
            "chunk_index": 0,
            "start_line": 1,
            "end_line": 2
        }]
        with patch("app.api.routers.repositories.retrieve_relevant_chunks", return_value=mock_retrieval), \
             patch("app.services.gemini_service.gemini_service.generate_content", return_value="Overview: run passes.") as mock_generate:
            ask_res4 = await client.post(
                f"/repositories/{repo_id}/ask",
                headers=auth_headers_a,
                json={"question": "What does run() do?"}
            )
            assert ask_res4.status_code == 200
            assert ask_res4.json()["answer"] == "Overview: run passes."
            # Confirm prompt contains honesty grounding note
            generated_prompt = mock_generate.call_args[1]["contents"]
            assert "partially indexed (1/2 chunks)" in generated_prompt

    finally:
        async with TestSessionLocal() as session:
            stmt = select(Repository).where(Repository.id == repo_id)
            r = (await session.execute(stmt)).scalar_one_or_none()
            if r:
                await session.delete(r)
                await session.commit()



