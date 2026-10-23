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

## Phase 6: Automated Test Suite, CI Verification & Production Hardening

### Problem Addressed
Zero automated tests currently exist. Development relies entirely on manual verification. Missing rate limiting and production environment configurations pose stability risks.

### Confirmed Files & Modules
- `backend/tests/` (to create)
- `backend/requirements.txt`
- `package.json`
- `backend/app/main.py`
- `README.md`

### Dependencies & Prerequisites
- Phases 1 through 5 completed.

### Implementation Approach
1. **Backend Automated Tests (Pytest):**
   - Add `pytest`, `pytest-asyncio`, and `httpx` to backend dependencies.
   - Create test suite covering:
     - `test_auth.py`: User registration, login, JWT validation, unauthenticated route protection.
     - `test_chunking.py`: File chunking with line number verification.
     - `test_repositories.py`: Upload validation, file listing, content retrieval, reindex idempotency.
     - `test_retrieval.py`: Vector cosine search, candidate deduplication, adjacent chunk merging.
2. **Frontend Component Tests:**
   - Add minimal smoke tests for `RepositoryCard`, `ChatMessage`, and `FileExplorer`.
3. **Production Guardrails & Documentation:**
   - Add basic rate limiting on `/auth/login` and `/ask`.
   - Update `README.md` with verified setup commands, Docker compose instructions, and required environment variables.

### Verification Steps & Automated Tests
- Run `pytest backend/tests/` -> All tests pass.
- Run `npm run test` or `npm run build` -> Clean build.

### Acceptance Criteria
- [ ] Complete automated test suite runs and passes in local and CI environments.
- [ ] Full end-to-end user journey (upload -> index -> view files -> chat with citations -> reindex) passes reliably.
- [ ] All DoD criteria satisfied.
