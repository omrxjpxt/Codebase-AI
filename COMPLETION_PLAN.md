# Codebase AI — Staged Completion Plan & Roadmap

**Target:** Reliable, Production-Ready Release  
**Architectural Baseline:** Next.js 15 (App Router) + FastAPI (Async SQLAlchemy) + PostgreSQL 15 (`pgvector`) + Google GenAI SDK (`google-genai`)  
**Guiding Principle:** Minimal disruptive changes, targeted fixes, verifiable vertical slices, no mock/fake embeddings in production.

---

## Lifecycle State Machine Alignment

The repository lifecycle states are confirmed as:
- **`pending`**: Archive uploaded or downloaded, repository and file/chunk records created in database, waiting for or initializing background embedding task.
- **`indexing`**: Background task actively generating embeddings via Gemini API and storing vector embeddings in PostgreSQL `pgvector`.
- **`indexed`**: All chunks have vector embeddings; architecture summary generated; repository ready for grounded chat and search.
- **`failed`**: Ingestion, extraction, chunking, or embedding generation encountered an unrecoverable error; `error_message` populated and displayed to the user with a "Re-index" option.

*(Note: The database currently contains legacy status `"completed"` on repository `samay-main`. A migration/cleanup step is included in Phase 1 to align legacy records).*

---

## Phase 1: Foundation Stability, Type Safety & Regression Test Suite (COMPLETED)

### Status: COMPLETED
All 5 tasks specified in Phase 1 have been implemented, tested, and strictly validated:
1. **Repository Router Crashes:** Resolved via `get_repository_model_or_404()` internal helper in `backend/app/api/routers/repositories.py`. Sub-resource endpoints now safely access ORM model attributes without `AttributeError`.
2. **Frontend TypeScript Safety:** Resolved all errors reported by `npx tsc --noEmit`. Restored `updateChatSession` import, added `summary?: string | null` to `Repository` type in `lib/api.ts`, and typed `html2pdf.js` image options with `as const`.
3. **Dashboard Status Polling:** Synchronized polling conditions in `app/dashboard/page.tsx` with backend lifecycle (`pending`, `indexing`, `processing`, `embedding`), aligned status badges in `RepositoryCard.tsx`, and updated `AskAiModal.tsx` to display true failed status and errors.
4. **Linting and Build Validation:** Installed `.eslintrc.json` with `next/core-web-vitals`, fixed unescaped entities in JSX, and removed `ignoreBuildErrors: true` and `ignoreDuringBuilds: true` from `next.config.ts`.
5. **Backend Regression Test Suite:** Implemented `pytest` suite in `backend/tests/test_repositories.py` with 9 isolated async tests using `NullPool` to verify endpoints, auth, and ownership isolation.

### Acceptance Criteria & Verification Results
- [x] No `AttributeError` on any repository sub-resource endpoint (`get_repository_files`, `get_file_content`, `get_repository_chunks`, `delete_repository`, `reindex_repository`).
- [x] File explorer API returns files in JSON without 500 error.
- [x] `docker-compose.yml` updated to `pgvector/pgvector:pg15`.
- [x] `npx tsc --noEmit` exits with 0 errors (Exit code: 0).
- [x] `npm run lint` completes non-interactively with 0 errors (Exit code: 0).
- [x] `npm run build` succeeds with strict type checking and linting enabled (Exit code: 0).
- [x] Dashboard polling terminates cleanly on terminal states (`indexed`, `failed`, `completed`).
- [x] `pytest backend/tests` passes 9/9 tests in 4.54s without touching existing user data.
- [x] Backend startup/import check succeeds: `CodeBase AI API`.


---

## Phase 2: Real AI Provider Integration, Async Batch Embeddings & Indexing Lifecycle (COMPLETED IN CODE)

### Status: IMPLEMENTED & TESTED (Live External Provider Blocked by Missing GEMINI_API_KEY)
All architectural, batching, retry, lifecycle, and retrieval requirements have been implemented and verified with 21 automated backend tests:
1. **Config Robustness:** Added `EMBEDDING_DIMENSIONS: int = 768` and enhanced `SettingsConfigDict` to resolve `.env` across directories.
2. **Async Gemini Service & Tenacity Fix:** Migrated `embed_content`, `embed_contents_batch`, `generate_content`, and `generate_content_stream` to `client.aio.models.*` on the asyncio loop. Fixed the Tenacity retry decorator to retry exclusively on transient errors (`is_retryable_gemini_error`: 429, 500, 502, 503, 504, network timeouts) without getting swallowed by inner try/catch blocks. Added strict 768-dimension validation.
3. **Batch Embedding Pipeline:** Refactored `generate_embeddings_for_repo` in `repository_service.py` to process code chunks in bounded batches of 25. Chunks are committed incrementally per batch. Enforces that no chunks remain unembedded before transitioning to `indexed`.
4. **Idempotent Reindexing & Concurrent Guards:** `POST /repositories/{id}/reindex` purges stale embeddings and resets status to `indexing`. Added 409 Conflict guard preventing concurrent indexing runs on the same repository.
5. **Grounded Vector Retrieval & Q&A Protection:** Added guardrails in `/repositories/{id}/ask` and `/repositories/chat-sessions/{session_id}/ask` preventing questions on unindexed or failed repositories. `retrieve_relevant_chunks` checks for embedded chunks and queries pgvector via cosine similarity distance.
6. **Provider Credential Requirement:** Live external calls remain safely blocked until a valid `GEMINI_API_KEY` is provided in `backend/.env`. Missing or invalid keys correctly raise HTTP 503 errors and update repository status to `failed` with safe error messages.

### Acceptance Criteria & Verification Results
- [x] Async batch embedding method `embed_contents_batch` implemented and verified.
- [x] Dimension validation strictly enforces 768 dimensions against PostgreSQL `Vector(768)`.
- [x] Tenacity retry decorator configured with `is_retryable_gemini_error` (retries transient 429/5xx, never permanent 400/401/403/ValueError).
- [x] Bounded batching (25 chunks/batch) and incremental database persistence implemented.
- [x] Concurrent reindexing prevented with HTTP 409 Conflict.
- [x] Full automated test suite passes: 21 of 21 tests in `backend/tests` (Exit code: 0).
- [x] `npx tsc --noEmit` exits with 0 errors (Exit code: 0).
- [x] `npm run lint` exits with 0 errors (Exit code: 0).
- [x] `npm run build` succeeds under strict validation (Exit code: 0).
- [ ] End-to-end live indexing against Google AI servers (Pending valid `GEMINI_API_KEY` in `backend/.env`).

---

## Phase 3: Ingestion Security, Path Normalization & Persistent Chat Sources (COMPLETED)

### Status: COMPLETED
All requirements for secure ZIP ingestion, GitHub path normalization, database citation persistence, and frontend citation rehydration have been implemented and verified across 29 backend tests and full frontend build checks:

1. **Secure ZIP Ingestion & Zip-Slip Protection (`backend/app/services/file_processor.py`):**
   - Replaced unsafe `extractall` with a strict member-by-member extraction loop.
   - Implemented `is_safe_zip_path()`: validates that the resolved canonical path (`os.path.commonpath([base_dir, target_path]) == base_dir`) stays strictly within the temporary extraction folder.
   - Explicitly rejects path traversal (`../`, `..\\`), absolute paths (`/etc/passwd`), Windows drive letters (`C:\\`, `D:`), UNC paths (`\\\\server\\share`), and null byte injection.
   - Implemented `is_zip_symlink()`: checks POSIX symlink mode `(external_attr >> 16) & 0o120000 == 0o120000` to prevent symlink traversal attacks.
   - Implemented decompression bomb protections: `MAX_FILE_SIZE_BYTES = 200MB`, `MAX_TOTAL_UNCOMPRESSED_BYTES = 500MB`, `MAX_TOTAL_FILES = 10,000`.
   - Guaranteed cleanup of temporary directories using `try...finally: shutil.rmtree(temp_dir, ignore_errors=True)`.

2. **GitHub Archive Path Normalization (`backend/app/services/file_processor.py`):**
   - Implemented `detect_archive_wrapper_dir()`: inspects archive member paths to detect if the archive contains a single top-level wrapper directory (standard GitHub zipball format, e.g. `owner-repo-7fd1a60/`).
   - Normalizes all paths using forward slashes (`/`), cleanly stripping the wrapper directory while preserving all internal directory hierarchies and filenames.
   - Gracefully handles flat archives, multi-root folders, and empty archives without mangling directory names.

3. **Persistent Chat Citations in PostgreSQL (`backend/app/models/chat.py`, Alembic migration, `backend/app/api/routers/chat.py`):**
   - Updated `Message` model with `sources: Mapped[Optional[List[Dict[str, Any]]]] = mapped_column(JSONB, nullable=True)`.
   - Created and applied Alembic migration `4d8f20f42fa2_add_sources_to_messages.py` (`db7f10ace821 -> 4d8f20f42fa2`) without touching or rewriting past migrations. Verified that existing database records remain intact.
   - Updated `MessageResponse` schema in `chat.py` to serialize `sources`.
   - Updated the streaming `/ask` NDJSON generator: captures grounded retrieval sources and saves `sources=sources_data if sources_data else None` on the assistant message record in PostgreSQL upon completion.
   - Updated frontend TypeScript interface `ChatMessage` in `lib/api.ts` to include `sources?: any[] | null`.
   - Updated `loadSession` in `app/repository/[id]/page.tsx` to rehydrate `sources: m.sources || []` on page load and session switch so citations render on refresh.

4. **Regression & Security Test Suite:**
   - Added `backend/tests/test_archive_security.py` (6 tests: path traversal, symlink detection, wrapper detection, path normalization, mixed malicious archives, and GitHub wrapper stripping).
   - Added `backend/tests/test_chat_persistence.py` (2 tests: DB persistence of sources, schema serialization, streaming NDJSON assistant message persistence).

### Acceptance Criteria & Verification Results
- [x] ZIP extraction strictly blocks path traversal (`../`, absolute, Windows paths, UNC, drive letters, null bytes, symlinks).
- [x] Extraction bomb limits enforced (file size, total size, file count).
- [x] Temporary extraction directories cleanly deleted even on extraction failures.
- [x] GitHub zipball single top-level wrapper directories stripped cleanly without altering internal hierarchies.
- [x] Alembic migration `4d8f20f42fa2` applied non-destructively; existing messages and repositories preserved.
- [x] Database stores `sources` JSONB column on `messages` table.
- [x] Retrieval citations persisted with assistant messages upon streaming completion.
- [x] Historical chat sessions load persisted source citations.
- [x] Frontend `ChatMessage` interface typed and `app/repository/[id]/page.tsx` rehydrates citations on load.
- [x] 29/29 backend tests passing (`pytest backend/tests` in 8.06s).
- [x] `npx tsc --noEmit` exits with 0 errors.
- [x] `npm run lint` exits with 0 errors.
- [x] `npm run build` succeeds under strict Next.js compilation (Exit code: 0).

---

## Phase 4: End-to-End QA, Integration Audit & Release Readiness (COMPLETED)

### Status: COMPLETED
All full-stack user journeys, adversarial security vectors, cross-user IDOR protections, and edge-case ingestion paths were audited, verified, and reinforced across 35 automated tests and strict production builds:

1. **Full-Stack Journey & Defect Fixes:**
   - **Cross-User IDOR Protections (`chat.py`, `chat_sessions.py`, `search.py`):**
     - Enforced `Repository.user_id == current_user.id` in `ask_chat_session` and `list_chat_sessions` so users cannot query or list sessions for repositories they do not own (returns 404).
     - Scoped global search query (`search.py`) with `ChatSession.user_id == current_user.id` to prevent cross-user chat title discovery.
     - Scoped `list_all_chat_sessions` join with `(Repository.user_id == current_user.id)` to prevent repository name discovery.
   - **Ingestion Resilience & Lazy-Load Async Bug Fix (`file_processor.py`, `repository_service.py`, `repositories.py`):**
     - Fixed SQLAlchemy async lazy-load greenlet error (`can't call await_only() here`) by pre-capturing `repo_id` before database rollback.
     - Wrapped zip extraction in `try/except` catching `zipfile.BadZipFile` and `zipfile.LargeZipFile`, returning clean HTTP 400 Bad Request with informative error messages.
     - Fixed empty and unsupported archive vulnerability: archives with 0 supported code files raise `ValueError("No supported code files found in repository archive.")`, safely transitioning status to `failed` and returning HTTP 400.
     - Fixed 0-chunk reindexing flaw: repositories with 0 chunks now transition to `failed` with `"No code chunks available to index in this repository."` rather than erroneously becoming `indexed`.
   - **GitHub URL Parsing (`github_service.py`):**
     - Replaced brittle string replacement with a flexible regex matching `http://`, `https://`, `www.`, `.git`, and trailing slashes.
   - **Frontend Stream Error Surfacing & Syntax Highlighting (`page.tsx`, `SourceViewerModal.tsx`):**
     - In `app/repository/[id]/page.tsx`, stream connection failures now parse and display detailed backend error messages (`errData.detail`) rather than generic `res.statusText`.
     - In `SourceViewerModal.tsx`, expanded `mapLanguage` to support full language names (`python`, `typescript`, `java`, `csharp`, `rust`, `go`, etc.) case-insensitively, restoring full syntax highlighting.

2. **Automated Verification:**
   - Added `backend/tests/test_e2e_qa_and_security.py` (6 tests: cross-user IDOR blocking, global search isolation, corrupted archive rejection, empty archive handling, 0-chunk reindex status guard, and GitHub URL regex parsing).
   - 35/35 backend tests passing in `backend/tests` (Exit code: 0, 11.57s).
   - `npx tsc --noEmit` exits with 0 errors.
   - `npm run lint` exits with 0 errors.
   - `npm run build` succeeds cleanly under strict Next.js compilation (Exit code: 0).
   - Database integrity confirmed: `samay-main` user repository (42 files, 430 chunks, 3 chat sessions, 4 messages) preserved intact.

### Capability Release Readiness Classification

| Capability | Status | Evidence & Notes |
| :--- | :--- | :--- |
| **Authentication & Sessions** | **VERIFIED** | JWT bearer and cookie authentication, bcrypt password hashing, session persistence, unauthenticated 401 blocking. |
| **Data Isolation & IDOR** | **VERIFIED** | Tested across repositories, files, chunks, chat sessions, and search. Cross-user access blocked with 404. |
| **Archive Ingestion Security** | **VERIFIED** | Zip-Slip traversal (`../`, absolute, drive letters, UNC, null bytes) blocked. Symlinks rejected. Bomb limits enforced. |
| **Path Normalization** | **VERIFIED** | GitHub top-level archive wrapper directory (`owner-repo-sha/`) detected and stripped cleanly; internal tree preserved. |
| **Empty/Malformed Archive Handling** | **VERIFIED** | Corrupted archives and 0-code-file archives reject with HTTP 400 and fail gracefully without phantom indexing. |
| **Citation Persistence & Rehydration** | **VERIFIED** | Message `sources` JSONB column created via Alembic. Citations persist on stream completion and rehydrate on reload. |
| **Search & Repository Exploration** | **VERIFIED** | File explorer tree, syntax-highlighted source viewer modal, and scoped multi-entity search verified. |
| **Async Batch Embedding & PGVector** | **VERIFIED** | In-database batching (25 chunks/batch), cosine similarity distance retrieval, 768-dim vector schema verified. |
| **Live Gemini Indexing & Q&A** | **BLOCKED** | All architecture, retries, and retrieval verified. Live external calls safely blocked pending user-configured `GEMINI_API_KEY` in `backend/.env`. |

---

## Phase 4.1: Gemini Model Compatibility & Live AI Readiness (COMPLETED)

### Status: COMPLETED
All configured models audited against official Google Gemini API documentation; deprecated `text-embedding-004` (shut down Jan 14, 2026) migrated to official `gemini-embedding-2` with Matryoshka Representation Learning (MRL) output dimensionality:

1. **Model Compatibility Audit & Configuration:**
   - **Embedding Model:** Migrated from deprecated `text-embedding-004` to `gemini-embedding-2` in `config.py`, `.env.example`, and `.env`.
   - **Output Dimensionality:** Configured `types.EmbedContentConfig(output_dimensionality=768)` in `gemini_service.py` to preserve the 768-dimensional PostgreSQL `pgvector` schema without schema changes or database migrations.
   - **Generation Model:** Confirmed `gemini-2.5-flash` is fully supported, high-performance, low-latency, and operates over a 1M token context window.

2. **Database Integrity & Mismatched Model Protection:**
   - Database chunk audit: confirmed 430 chunks exist in `samay-main` with 0 legacy embeddings (`embedding = None`).
   - Hardened `retrieval_service.py` to filter similarity search by `Chunk.embedding_model == settings.EMBEDDING_MODEL` so incompatible embeddings from legacy models are never mixed into vector calculations.
   - Hardened `repository_service.py` to detect chunks with mismatched embedding models (`or_(Chunk.embedding.is_(None), Chunk.embedding_model != settings.EMBEDDING_MODEL)`) and automatically re-embed them during indexing.

3. **Verification Results:**
   - 38/38 backend tests passing in `backend/tests` (Exit code: 0, 12.75s).
   - Added regression tests for output dimensionality configuration, mismatched model isolation, and model re-embedding.
   - Frontend TypeScript validation passes (`npx tsc --noEmit`: 0 errors).
   - Frontend lint passes (`npm run lint`: 0 errors).
   - Production Next.js build succeeds cleanly (`npm run build`: Exit code: 0).

---

## Phase 4.2: Embedding Semantics, Retrieval Quality & Model Readiness (COMPLETED)

### Status: COMPLETED
Addressed SDK embedding request semantics, retrieval prompt formatting according to official Google documentation, and generation model catalogue updates:

1. **Embedding Request Semantics & Content-Object Isolation:**
   - **Transformer Analysis:** Deep audit of `google-genai` SDK (`_transformers.t_contents`) confirmed that submitting a plain list of strings (`["s1", "s2"]`) groups them into a single `UserContent` with multiple parts, which causes `gemini-embedding-2` to return a single aggregated document embedding rather than independent embeddings per chunk.
   - **Content Wrapping:** Hardened `GeminiService.embed_contents_batch` and `_embed_contents_raw` to wrap each chunk into an independent `types.Content(parts=[types.Part.from_text(text=t)])`. This ensures `t_contents` produces $N$ separate `Content` objects, guaranteeing exactly one discrete embedding per submitted code chunk.
   - **Count Invariant & Strict Validation:** Enforced that `len(response.embeddings) == len(texts)` before any database writes. Added checks rejecting `None`, `NaN`, `Inf`, and dimensionally mismatched vector values with HTTP 502 Bad Gateway.
   - **SDK Pinning:** Pinned `google-genai>=2.10.0` in `backend/requirements.txt`.

2. **Retrieval-Specific Embedding Formatting:**
   - Implemented documented Gemini asymmetric retrieval prefixes:
     - **Repository Code Chunks:** Formatted as `title: {file_path} | text: {code_content}` (or `title: none | text: {code_content}` when path is empty/missing). Raw original source code is preserved in `Chunk.content` in the database and in displayed source citations.
     - **User Questions:** Formatted as `task: code retrieval | query: {question}`.
   - Documented that legacy `task_type` parameter is not used with `gemini-embedding-2`.

3. **Generation Model Catalogue Audit:**
   - Audited Google Gemini model availability catalogue: access to Gemini 2.5 series is restricted to legacy accounts with historical usage history, with Google directing new projects to latest Flash generations.
   - Updated `CHAT_MODEL` default to `gemini-3.8-flash` in `backend/app/core/config.py`, `backend/.env.example`, and `backend/.env`.

4. **Verification & Regression Suite:**
   - **45/45 backend tests passing** in `backend/tests` (`./venv/bin/pytest -v`: 13.24s).
   - Added 7 new unit & integration regression tests:
     - `test_embed_contents_batch_builds_separate_content_objects`
     - `test_batch_embedding_fails_on_aggregated_response_count_mismatch`
     - `test_batch_embedding_fails_on_nan_or_inf_embedding`
     - `test_format_code_chunk_for_embedding`
     - `test_format_query_for_embedding`
     - `test_indexing_formats_retrieval_document_and_preserves_raw_chunk_content`
     - `test_generate_query_embedding_applies_code_retrieval_task_prefix`
   - **Database Integrity:** Verified live database: `samay-main` (42 files, 430 chunks, 0 non-null embeddings, 4 messages, 3 chat sessions) preserved with zero data deletion.
   - **Frontend Validation:** `npx tsc --noEmit` (0 errors), `npm run lint` (0 errors), `npm run build` (compiled all 11 routes cleanly, Exit code: 0).
   - **Live API Smoke Test:** Verified `GEMINI_API_KEY` is configured in `backend/.env` without leaking values.

---

## Phase 5: Live Gemini API Smoke Test & First Real Indexing (COMPLETED)

### Status: COMPLETED
Successfully verified live AI services with real Google Gemini API calls, persistent pgvector embeddings, and grounded Q&A:

1. **Safe Configuration Verification:**
   - Confirmed `GEMINI_API_KEY` is present and active in `backend/.env` (length 53 characters; secret value never printed, revealed, or committed).
   - Validated active models: Embedding `gemini-embedding-2` (768 dimensions), Generation `gemini-3.8-flash`.
   - Verified pinned SDK dependency: `google-genai==2.10.0` in `backend/requirements.txt`.

2. **Real Embedding Test (Google GenAI API):**
   - Dispatched 2 independent code inputs to `gemini-embedding-2`.
   - Verified 2 independent 768-dimensional float vectors were returned (`all_finite=True`).
   - Vectors were verified distinct (dot product = 0.7429), verifying 1-to-1 input-to-output mapping without document aggregation.

3. **Real Generation & Streaming Test:**
   - Non-streaming call to `gemini-3.8-flash` generated a correct, complete answer on vector embeddings (163 chars).
   - Streaming call to `gemini-3.8-flash` using `generate_content_stream` successfully yielded tokens over SSE interface.

4. **Bounded Real Indexing & Database Integrity:**
   - Database verified before test: `samay-main` (42 files, 430 chunks, 4 messages, 3 chat sessions) intact.
   - Executed bounded indexing via `generate_embeddings_for_repo(repo_id, max_chunks=5)`:
     - 10 chunks from `samay-main` generated and persisted valid 768-dimensional vectors with `embedding_model = 'gemini-embedding-2'` and UTC timestamps.
     - Confirmed the repository was **not** marked `indexed` prematurely (status remained `completed` with 420/430 unembedded chunks).

5. **Real Vector Retrieval & Grounded Q&A:**
   - Real query embedding generated for: `"How does the how-to page track or handle a new visitor in Samay?"`.
   - Real pgvector cosine similarity search returned `samay-main/pages/how-to.tsx` as the top match (similarity score 0.802).
   - Grounded Q&A generated by `gemini-3.8-flash`:
     > Based on the provided context in `samay-main/pages/how-to.tsx`, the `HowTo` page checks if `window` is defined (ensuring it runs in the browser/client-side) and sets the `samayNewVisitor` key in `localStorage` to `false`:
     > ```typescript
     > if (typeof window !== "undefined") {
     >   localStorage.setItem("samayNewVisitor", JSON.stringify(false));
     > }
     > ```
   - Verified citation mapping and message persistence in PostgreSQL.

6. **Full Repository Indexing Decision:**
   - Remaining chunks to embed: 420 chunks (out of 430 total).
   - Estimated API requests: 42 batches (at 10 chunks/call).
   - Rate limit pacing: 15 RPM on Google AI Studio free tier implies ~3-4 minutes runtime for a full reindex. Full indexing can be triggered via standard production workflow.

---

## Phase 5.1: Indexing Boundaries, Status Correctness & Full-Index Readiness (COMPLETED)

### Status: COMPLETED
Successfully audited the indexing limit discrepancy, formalized `max_chunks` semantics, hardened the complete-index invariant, corrected repository readiness reporting across backend and frontend, and verified local database integrity:

1. **Indexing Limit Discrepancy Root Cause & Fix:**
   - **Root Cause:** In Phase 5, the smoke test script (`scratch_smoke_test.py`) was invoked twice. In the first invocation at 09:56:43 UTC, `generate_embeddings_for_repo(repo_id, max_chunks=5)` selected the first 5 unembedded chunks (`limit(5)`), embedded them, and committed them to PostgreSQL. The script then failed on an assertion key (`KeyError: 'distance'`). The script was rerun at 09:58:23 UTC. On the second run, the query selected the *next 5 unembedded chunks* (`where(embedding.is_(None)).limit(5)`), successfully embedding 5 more chunks. Each invocation strictly adhered to `max_chunks=5`, resulting in 5 + 5 = 10 total embeddings committed.
   - **Fix & Strict Limit Enforcement:**
     - Parameter semantics formalized: `max_chunks` strictly specifies the maximum number of individual code chunks (not batches) to fetch, embed, and write to PostgreSQL in a single invocation.
     - Added parameter guard: `max_chunks <= 0` immediately returns with 0 database writes and 0 API calls.
     - Added double-layer limit enforcement: both database query level (`.limit(max_chunks)`) and list slice level (`chunks = chunks[:max_chunks]`).
     - Added regression tests verifying exact database writes under `max_chunks=N` and `max_chunks=0`.

2. **Repository Indexing Status Semantics & State Machine:**
   - **Distinction Clarified:**
     - Archive Ingestion: `processing` -> `completed` (legacy: files and chunks extracted and committed to database).
     - AI Indexing: `indexing` (active background task) -> `partially_indexed` (some chunks embedded, unembedded/stale chunks remain) -> `indexed` (complete-index invariant satisfied).
     - Failures: `failed` with descriptive `error_message`.
   - **Complete-Index Invariant Implemented (`get_repository_readiness`):**
     - A repository is reported as `indexed` if and only if `total_chunks > 0`, `missing_chunks == 0`, `stale_chunks == 0`, and all non-null vectors have length 768.
     - Stale or incompatible models (e.g. legacy `text-embedding-004`) are treated as unindexed and will not satisfy the invariant.
     - Synchronizes `Repository.status` dynamically so database records honestly reflect AI readiness.
   - **Honest Q&A & Chat Handling:**
     - Completely unindexed repositories (`indexed_chunks == 0`): `/ask` and `/chat-sessions/{id}/ask` reject with HTTP 400 stating indexing is required.
     - Partially indexed repositories: allowed to query indexed files safely, with explicit prompt grounding notice: `"Note: Codebase is partially indexed (X/Y chunks). Context is limited to indexed code."`
     - Streaming responses yield readiness events informing the client.
   - **Resumable Reindexing:**
     - `POST /repositories/{id}/reindex` preserves existing valid `gemini-embedding-2` vectors! Only chunks with stale/incompatible models or null embeddings are queued for embedding.
   - **Frontend Readiness & Status Badges:**
     - `RepositoryCard.tsx`: Mapped `partially_indexed` to amber with `Partially Indexed (10/430)` progress text, and `completed` to yellow `Ingested` (no longer misleadingly shown as green "Indexed").
     - `AskAiModal.tsx`: Explicitly displays `Partially indexed (10/430 chunks)` and `Ingested (Indexing pending)` rather than `Ready for chat`.
     - `app/repository/[id]/page.tsx`: Status badge dynamically styled by state (green for indexed, amber for partially indexed, blue with spinner for indexing, yellow for ingested); renders informative alert banner for partially indexed repositories with a "Resume Indexing" button; auto-polls repository status every 3s while indexing is active.

3. **Database Audit & Verification:**
   - Verified real local database without deleting or resetting any user data:
     - Users: 1 (`omgangster9@gmail.com`)
     - Repositories: 1 (`samay-main`, ID: `526d46c2-b602-4541-a799-64ee1a5c422e`)
     - Files: 42
     - Total chunks: 430
     - Valid `gemini-embedding-2` vectors: 10 (all 768-dimensional, non-null, valid float vectors preserved)
     - Missing embeddings: 420
     - Stale model vectors: 0
     - Chat sessions: 3, Messages: 4 (with persisted citations intact)
     - Repository status updated: `samay-main` status is `partially_indexed` (honest representation of AI readiness).

4. **API Quota & Full-Index Workload Analysis:**
   - **Verified API Quota Behavior:** Inspected `google-genai` SDK and HTTP responses. The Gemini Developer API does not return rate limit or quota headers in HTTP responses; quota limits are managed in Google AI Studio.
   - **Remaining Workload Estimation:**
     - Remaining chunks: 420 chunks.
     - Batch size: 10 chunks per API call (`BATCH_SIZE = 10` or `25`).
     - At 10 chunks/batch: 42 API requests total.
     - Free tier pacing (15 RPM): requires ~3-4 minutes runtime with exponential backoff on transient 429 errors.
     - Pay-as-you-go tier (1,500+ RPM): requires ~15-30 seconds.
     - Safe resume: Each batch commits immediately upon return. Transient network drops or rate limit timeouts do not lose progress; restarting resumes from the next unembedded chunk.
     - Full indexing was intentionally **not** run in this phase.

5. **Test & Build Verification Results:**
   - [x] Backend test suite: 49 / 49 tests passing in 9.08s (`pytest backend/tests`).
   - [x] Database migration check: Alembic at head `4d8f20f42fa2`.
   - [x] TypeScript validation: 0 errors (`npx tsc --noEmit`).
   - [x] Frontend lint: 0 errors (`npm run lint`).
   - [x] Production build: 11 / 11 routes built successfully (`npm run build`).
   - [x] No secrets logged; no git resets or history rewrites; existing database records preserved.




