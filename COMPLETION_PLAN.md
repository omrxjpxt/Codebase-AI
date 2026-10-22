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

## Phase 3: Real AI Provider Integration, Async Gemini Client & Batch Embeddings

### Problem Addressed
Repository indexing currently fails with 503 because `GEMINI_API_KEY` is empty. Furthermore, `GeminiService` uses blocking synchronous calls on the asyncio event loop, processes chunks one-by-one (leading to rate limits), and has a broken Tenacity retry decorator that never retries on `APIError`.

### Confirmed Files & Modules
- `backend/.env` & `backend/.env.example`
- `backend/app/core/config.py`
- `backend/app/services/gemini_service.py`
- `backend/app/services/repository_service.py`
- `backend/app/api/routers/repositories.py`

### Dependencies & Prerequisites
- Valid Google Gemini API Key from Google AI Studio.
- Phase 1 & 2 completed.

### Implementation Approach
1. **Config Robustness:**
   - Ensure `SettingsConfigDict` in `backend/app/core/config.py` resolves `.env` relative to the file or allows `_env_file` fallback so running from either project root or `backend/` correctly loads `GEMINI_API_KEY`.
2. **Refactor `GeminiService` to Fully Async & Fix Retries:**
   - Use `client.aio.models.embed_content` and `client.aio.models.generate_content` instead of blocking synchronous client methods.
   - Refactor retry mechanism: Let `APIError` bubble directly to `@retry` without being swallowed by inner `try...except`, or retry inside the helper before translating to `HTTPException`.
   - Add batch embedding method:
     ```python
     async def embed_contents_batch(self, texts: list[str], model: str = settings.EMBEDDING_MODEL) -> list[list[float]]:
     ```
3. **Optimize Embedding Pipeline (`generate_embeddings_for_repo`):**
   - Process chunks in batches of 20 to 50 chunks per Gemini API request.
   - Write embeddings back to chunks and commit per batch.
   - Accurately catch API errors, set status to `failed`, and record detailed error message.
4. **Validate Reindex:**
   - Ensure `POST /repositories/{id}/reindex` safely resets embeddings, clears error messages, updates status to `indexing`, and kicks off the background task. Add a check to prevent starting a reindex if `status == "indexing"`.

### Regression Risks
- Rate limits on Gemini Free Tier (15 RPM). Mitigated by batching multiple texts into single API requests.

### Verification Steps & Automated Tests
- Add a script or test `backend/tests/test_gemini_service.py` that mocks or tests the async client embedding and generation methods.
- Trigger `reindex` on existing `samay-main` repository -> Observe logs showing batch embedding generation -> Verify chunks in DB have `embedding IS NOT NULL` -> Verify status transitions to `indexed`.

### Acceptance Criteria
- [ ] Valid `GEMINI_API_KEY` authenticated on backend startup.
- [ ] Embedding generation completes for 400+ chunks in under 30 seconds using batching without blocking the FastAPI event loop.
- [ ] All generated embeddings stored in PostgreSQL with 768 dimensions.
- [ ] Transient API rate limits properly retried via Tenacity backoff.

---

## Phase 4: Ingestion Security, GitHub Zipball Normalization & Resilience

### Problem Addressed
`extract_and_scan_zip` is vulnerable to Zip-Slip directory traversal attacks. GitHub zipball downloads retain an arbitrary top-level directory prefix (`{owner}-{repo}-{commit_hash}/`) in stored file paths. If indexing fails before chunking, the uploaded archive is already deleted, making re-indexing impossible.

### Confirmed Files & Modules
- `backend/app/services/file_processor.py`
- `backend/app/services/github_service.py`
- `backend/app/services/repository_service.py`
- `backend/app/api/routers/repositories.py`

### Dependencies & Prerequisites
- Phase 3 completed.

### Implementation Approach
1. **Fix Zip-Slip in `file_processor.py`:**
   - Validate each member path before extraction to guarantee it stays inside `temp_dir`:
     ```python
     def is_safe_path(base_dir: str, target_path: str) -> bool:
         abs_base = os.path.abspath(base_dir)
         abs_target = os.path.abspath(target_path)
         return os.path.commonpath([abs_base]) == os.path.commonpath([abs_base, abs_target])
     ```
   - Skip or reject unsafe archive members.
2. **Normalize GitHub Zipball File Paths:**
   - Detect if the archive has a single top-level directory (standard GitHub zipball structure) and strip that leading segment from relative file paths so paths appear as `src/main.py` instead of `owner-repo-7fd1a60/src/main.py`.
3. **Upload & Ingestion Error Handling:**
   - If extraction or chunking fails, record the error on the repository before raising HTTPException, ensuring the user gets a clear failure explanation on the dashboard.

### Regression Risks
- Modifying relative path calculation might affect file explorer hierarchy if not properly stripped. Must preserve relative internal paths.

### Verification Steps & Automated Tests
- Test extraction with a test ZIP file containing nested directories.
- Test downloading a public GitHub repo (e.g. `https://github.com/octocat/Hello-World`) -> verify file paths in database do not contain the commit hash prefix.

### Acceptance Criteria
- [ ] ZIP extraction blocks path traversal attempts.
- [ ] GitHub imports store clean relative paths matching the repository tree.
- [ ] Extraction failures are recorded in the DB with status `failed`.

---

## Phase 5: Grounded RAG Chat, Citation Persistence & Rich Markdown Rendering

### Problem Addressed
Source citations generated during AI streaming chat are yielded to the client but never persisted in the database `messages` table, causing citations to disappear when a user refreshes or returns to a chat session. Furthermore, the chat message UI renders raw text with a rudimentary bold/inline-code parser, collapsing all newlines and rendering code blocks as plain text without syntax highlighting.

### Confirmed Files & Modules
- `backend/app/models/chat.py`
- `backend/alembic/versions/` (new migration)
- `backend/app/api/routers/chat.py`
- `backend/app/schemas/chat.py`
- `lib/api.ts`
- `components/repository/ChatMessage.tsx`
- `app/repository/[id]/page.tsx`

### Dependencies & Prerequisites
- Phase 3 completed (real vector embeddings present in database).

### Implementation Approach
1. **Database Migration for Message Sources:**
   - Add `sources: Mapped[list[dict] | None] = mapped_column(JSONB, nullable=True)` to `Message` model in `backend/app/models/chat.py`.
   - Generate and apply Alembic migration `add_sources_to_messages`.
2. **Persist Sources in Chat Stream Handler:**
   - In `backend/app/api/routers/chat.py`: In the streaming generator completion, save both `content=full_text` and `sources=sources_data` when writing the assistant message to the database.
   - Update `MessageResponse` schema to include `sources`.
3. **Hydrate Sources on Client:**
   - In `app/repository/[id]/page.tsx`: In `loadSession`, map `m.sources` from backend response into state so historical chats display citation pills.
4. **Rich Markdown & Syntax Highlighting in Chat:**
   - Update `components/repository/ChatMessage.tsx`:
     - Render markdown properly (using `react-syntax-highlighter` or standard structured block rendering with `whitespace-pre-wrap`).
     - Support code fences (` ```language ... ``` `) with copy-to-clipboard buttons and syntax highlighting.
     - Support headings, bullet lists, and paragraphs.
   - Ensure clicking source pills accurately opens `SourceViewerModal` at the cited line range.

### Regression Risks
- PDF export and clipboard copy in `ChatMessage.tsx` must still work with the updated content formatting.

### Verification Steps & Automated Tests
- Open an indexed repository -> Ask a question in chat -> Verify streaming response displays formatted code, lists, and source pills -> Refresh page -> Verify past answer still displays its source citation pills -> Click source pill -> Verify modal opens to exact file and highlighted lines.

### Acceptance Criteria
- [ ] Database stores citations alongside assistant messages.
- [ ] Refreshing page or switching chat sessions preserves all source code citations.
- [ ] Markdown in AI responses renders with proper line breaks, lists, and syntax-highlighted code blocks.
- [ ] Clicking a source pill displays the exact file content with cited lines highlighted.

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
