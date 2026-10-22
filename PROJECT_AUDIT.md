# Codebase AI — Comprehensive Project Audit Report

**Date:** October 2026  
**Auditor:** Senior Software Engineer & Technical Lead  
**Repository:** [https://github.com/omrxjpxt/Codebase-AI](https://github.com/omrxjpxt/Codebase-AI)  
**Local Workspace:** `/Users/omgangwar/Documents/Projects/CodeBase AI`  
**Current Git Branch:** `main` (clean working tree; 2 commits behind remote tracking branch `origin/main` consisting solely of README title adjustments)

---

## 1. Executive Summary & Project Maturity

### Current Maturity Level: **Late Alpha / Unstable Beta**

CodeBase AI is designed as an AI-powered codebase intelligence platform that ingests codebases via ZIP upload or GitHub URL, indexes source code via semantic embeddings in PostgreSQL (`pgvector`), and provides grounded conversational Q&A with citations, a tree-view file explorer, architecture overviews, and global search.

While the fundamental architectural structure and UI skeleton are thoughtfully designed, the current codebase suffers from **three critical blockers** that prevent standard end-to-end operation:
1. **AI Ingestion Failure:** The `GEMINI_API_KEY` environment variable in `backend/.env` is empty. Every repository upload or reindex attempt fails during the background embedding generation phase, recording a `503 Service Unavailable` error and marking the repository as `failed`.
2. **Backend API Crashes:** Key repository sub-resource endpoints (`/repositories/{id}/files`, `/repositories/{id}/files/{file_id}/content`, `/repositories/{id}/chunks`, and repository deletion) crash with an unhandled Python `AttributeError: 'dict' object has no attribute 'id'` because the internal dependency function returns a dictionary instead of an object.
3. **Frontend Compilation & Lint Breakages:** `npx tsc --noEmit` fails with 11 TypeScript errors across three core files (missing imports, missing properties on shared types, and library type mismatches). These errors are actively masked in production builds by `ignoreBuildErrors: true` in `next.config.ts`. Furthermore, `npm run lint` hangs indefinitely because ESLint was never initialized with a configuration file.

The database contains one registered user (`omgangster9@gmail.com`) and one repository (`samay-main` with 42 files and 430 chunks, but 0 vector embeddings). There are currently **zero automated tests** (neither unit, integration, nor end-to-end tests) anywhere in the frontend or backend.

---

## 2. Verified Architecture & Major Data Flows

```mermaid
graph TD
    subgraph Client["Next.js 15 Frontend (Port 3000)"]
        UI[App Router: Dashboard, Repo, Files, Chats]
        API_Client["lib/api.ts (fetchApi with Bearer/Cookie Auth)"]
    end

    subgraph Server["FastAPI Backend (Port 8000)"]
        RouterAuth["/auth (Register, Login, GitHub OAuth)"]
        RouterRepo["/repositories (Upload, GitHub Import, Reindex)"]
        RouterChat["/repositories/chat-sessions (Stream Ask, Manage)"]
        RouterSearch["/search (Global Search across DB)"]
        BgTasks["asyncio.create_task (Embedding Generation & Summaries)"]
    end

    subgraph DataStore["PostgreSQL 15 + pgvector (Port 5432)"]
        DB_Users[users]
        DB_Repos[repositories]
        DB_Files[files]
        DB_Chunks[chunks (vector dim 768)]
        DB_Chats[chat_sessions & messages]
    end

    subgraph External["External Services"]
        GeminiAPI["Google GenAI API (text-embedding-004, gemini-2.5-flash)"]
        GitHubAPI["GitHub API (Zipball Download & OAuth)"]
    end

    UI --> API_Client
    API_Client --> RouterAuth
    API_Client --> RouterRepo
    API_Client --> RouterChat
    API_Client --> RouterSearch

    RouterAuth --> DB_Users
    RouterRepo --> DB_Repos
    RouterRepo --> DB_Files
    RouterRepo --> DB_Chunks
    RouterRepo --> BgTasks
    RouterChat --> DB_Chats
    RouterChat --> DB_Chunks
    RouterSearch --> DB_Repos
    RouterSearch --> DB_Files
    RouterSearch --> DB_Chunks

    RouterAuth -.-> GitHubAPI
    RouterRepo -.-> GitHubAPI
    BgTasks -.-> GeminiAPI
    RouterChat -.-> GeminiAPI
```

### Major Data Flows Verified in Source Code:
1. **ZIP Ingestion & GitHub Import:**
   - Upload: Client sends `.zip` payload to `POST /repositories/upload` -> Validated for `.zip` suffix and max size (default 200MB) -> Saved temporarily to `UPLOAD_DIRECTORY` (`uploads/`) -> `process_and_store_repository` creates a `Repository` record with status `pending`.
   - GitHub Import: Client sends URL to `POST /repositories/github-import` -> `download_github_repo` streams GitHub zipball via `httpx` to `UPLOAD_DIRECTORY` -> Same processing as ZIP upload.
   - Extraction & Chunking: `extract_and_scan_zip` extracts to a temp directory, traverses files excluding ignored dirs (`node_modules`, `.git`, etc.), detects language by extension, reads content as UTF-8, creates `File` records, and calls `chunk_file` (1500 char windows with 200 char overlap, tracking line numbers) to create `Chunk` records.
   - Background Task: In-process `asyncio.create_task(generate_embeddings_for_repo(repo.id))` is initiated, and the temporary archive is deleted in a `finally` block if `DELETE_UPLOADED_ZIP_AFTER_INDEXING=True`.

2. **Embedding Generation & Vector Indexing:**
   - `generate_embeddings_for_repo` updates status to `indexing`.
   - Iterates over chunks with `Chunk.embedding.is_(None)`.
   - Calls `generate_query_embedding(chunk.content)` -> calls `gemini_service.embed_content(text, model="text-embedding-004")`.
   - Stores 768-dimensional float array in `Chunk.embedding` (PostgreSQL `vector(768)`).
   - Commits every 50 chunks.
   - On completion, sets status to `indexed`, clears `error_message`, and fires `generate_repository_summary(repo_id)` in the background.
   - On exception: Rolls back transaction, sets repository status to `failed`, and stores `error_message = str(e)`.

3. **Grounded Question Answering & Retrieval:**
   - Client sends question to `POST /repositories/chat-sessions/{session_id}/ask`.
   - Retrieval: `retrieve_relevant_chunks` embeds the question -> performs vector cosine similarity search in PostgreSQL:
     ```sql
     SELECT chunks.*, files.*, chunks.embedding <=> query_embedding AS distance
     FROM chunks JOIN files ON chunks.file_id = files.id
     WHERE chunks.repository_id = :repo_id AND chunks.embedding IS NOT NULL
     ORDER BY chunks.embedding <=> query_embedding LIMIT 24;
     ```
   - Deduplication & Diversity: Filters identical content chunks, caps chunks per file to `top_k / 2`, merges adjacent chunks by line number, and returns top 8 merged sources.
   - Generation: Constructs an engineering prompt containing file paths, code snippets, and question -> streams response via `gemini_service.generate_content_stream` as `application/x-ndjson`.
   - Client consumes stream: parses `sources`, appends `chunk` text to message, and stores final assistant message in database (note: sources are omitted from DB persistence).

---

## 3. Confirmed Working, Partially Working, Broken, and Unverified Features

| Feature Area | Sub-Feature | Status | Verification Evidence / Reason |
| :--- | :--- | :--- | :--- |
| **Authentication** | Email/Password Registration & Login | **Working** | Verified `backend/app/api/routers/auth.py`, bcrypt hashing, JWT issuance. |
| | Current User (`/auth/me`) | **Working** | Verified dependency `get_current_user` extracts Bearer header & cookie. |
| | GitHub OAuth Flow | **Partially Working** | Implemented in backend & frontend, but requires live client credentials in production. |
| | Protected Routes (Client) | **Partially Working** | Handled client-side in `fetchApi` upon receiving 401; no server-side Next.js middleware exists. |
| **Dashboard** | Repository Cards & Metrics | **Working** | Verified `components/dashboard/RepositoryCard.tsx` and statistics widgets. |
| | Repository Status Polling | **Broken** | `app/dashboard/page.tsx` checks `status === "processing" \|\| status === "embedding"`; backend uses `pending`/`indexing`. Dashboard never polls! |
| | Recent Activity Feed | **Broken / Stub** | Hardcoded empty state: `"Empty activity state since we don't have backend for this yet"`. |
| | "View All" Repositories Link | **Broken** | Points to `href="#"`. |
| **Ingestion** | ZIP Upload Validation & Unpacking | **Working** | Verified size check, extension check, in-memory chunking. |
| | GitHub Public Repo Import | **Partially Working** | Streams zipball; however, keeps top-level `{repo}-{commit}/` path prefix on all files. |
| | Zip-Slip Security | **Broken** | `zip_ref.extractall(temp_dir)` in `file_processor.py` lacks path sanitization. |
| **Indexing** | Status Transitions | **Partially Working** | Backend updates `pending -> indexing -> indexed \| failed`. Database contains legacy status `completed`. |
| | Embedding Generation | **Broken** | Fails with 503 because `GEMINI_API_KEY` is empty in `backend/.env`. |
| | Tenacity API Retry | **Broken** | Decorator specifies `retry_if_exception_type(APIError)`, but inner `try/except` catches it and raises `HTTPException`. Retries never fire. |
| | Async Concurrency / Event Loop | **Broken** | `embed_content` and `generate_content` make blocking synchronous network calls in async handlers. |
| | Safe Re-indexing | **Partially Working** | `POST /repositories/{id}/reindex` resets chunk embeddings, but cannot re-extract files if zip was deleted. |
| **Repository View** | File Explorer (`/repositories/{id}/files`) | **Broken** | `AttributeError: 'dict' object has no attribute 'id'` on `get_repository` call in router. |
| | File Content Viewer (`/files/{file_id}/content`) | **Broken** | Same `AttributeError: 'dict' object has no attribute 'id'`. |
| | Chunk Inspector (`/chunks`) | **Broken** | Same `AttributeError: 'dict' object has no attribute 'id'`. |
| | Repository Deletion (`DELETE /{id}`) | **Broken** | Same `AttributeError: 'dict' object has no attribute 'id'`. |
| | Chat Sessions (Create, List, Rename, Delete) | **Working** | Fully implemented in `backend/app/api/routers/chat.py` with CASCADE deletes. |
| | AI Chat Streaming | **Partially Working** | NDJSON streaming works when API key exists, but markdown renderer collapses all newlines and lacks syntax highlighting. |
| | Source Code Citations | **Partially Working** | Sources stream to UI and open modal, but are never persisted to DB `messages` table (lost on refresh). |
| | Architecture Summary Tab | **Partially Working** | Endpoint exists; UI renders raw HTML replace, but `RepositoryDetail` interface lacks `summary` field (TS error). |
| **Search** | Global Search (`CMD+K`) | **Working** | `backend/app/api/routers/search.py` performs multi-table ILIKE search scoped by user ID. |
| **Build & Tooling** | TypeScript Compilation | **Broken** | `npx tsc --noEmit` fails with 11 errors. Bypassed by `ignoreBuildErrors: true` in `next.config.ts`. |
| | ESLint Validation | **Broken** | `npm run lint` hangs on prompt because ESLint 9 configuration file is missing. |
| | Automated Tests | **Broken / Missing** | 0 unit/integration tests exist in backend or frontend. |
| | Docker Compose | **Broken** | `docker-compose.yml` specifies `postgres:15-alpine` without `pgvector`. |

---

## 4. Root-Cause Analysis: The AtlasIngest Indexing Failure

### Historical Context & Investigation Findings
The user previously observed that repository indexing failed for `AtlasIngest`, displaying a 503 error indicating that AI services were not configured.

### Direct Source Code Evidence:
1. **Empty API Key in Configuration:**
   In `backend/.env`, line 12:
   ```env
   GEMINI_API_KEY=
   ```
2. **Client Initialization Guard in `backend/app/services/gemini_service.py` (lines 23–28):**
   ```python
   def _get_client(self) -> genai.Client:
       if not self._client:
           if not settings.GEMINI_API_KEY:
               raise ValueError("GEMINI_API_KEY is not configured")
           self._client = genai.Client(api_key=settings.GEMINI_API_KEY)
       return self._client
   ```
3. **Exception Translation in `_handle_api_error` (lines 32–37):**
   ```python
   if isinstance(e, ValueError) and "GEMINI_API_KEY is not configured" in str(e):
       logger.error("Attempted to call Gemini API but GEMINI_API_KEY is missing.")
       raise HTTPException(
           status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
           detail="AI services are not configured on this server. Please add an API key."
       )
   ```
4. **Failure Capture in `generate_embeddings_for_repo` (`repository_service.py` lines 120–130):**
   ```python
   except Exception as e:
       logger.error(f"Failed to generate embeddings for repo {repo_id}: {e}")
       await db.rollback()
       # Reload repo and set to failed
       stmt = select(Repository).where(Repository.id == repo_id)
       result = await db.execute(stmt)
       repo = result.scalar_one_or_none()
       if repo:
           repo.status = "failed"
           repo.error_message = str(e)
           await db.commit()
   ```
   When `str(e)` is called on an `HTTPException(503, detail="...")`, it converts to:
   `"503: AI services are not configured on this server. Please add an API key."`
5. **UI Display:**
   `components/dashboard/RepositoryCard.tsx` (lines 53–56) directly displays `repo.error_message` next to the Failed status badge.

### Indexing Failure Questions Answered:
- **Why did the indexing attempt fail?** Confirmed: `GEMINI_API_KEY` was empty.
- **Is `GEMINI_API_KEY` required by the current implementation?** Yes. It is strictly required for embedding chunks (`text-embedding-004`), answering chat questions (`gemini-2.5-flash`), and generating repository summaries.
- **Are environment variables loaded by the correct process?** Pydantic-settings loads `.env` from the current working directory (`env_file=".env"`). If launched from the root directory instead of `backend/`, it looks in the wrong directory unless explicitly pointed to `backend/.env`.
- **Do provider, model, and vector dimensions agree?** Yes. Google `text-embedding-004` natively outputs 768 dimensions. The PostgreSQL column in `chunks.embedding` is defined as `Vector(768)` and the migration matches.
- **Can a failed repository be safely retried?** Partially. Calling `POST /repositories/{id}/reindex` resets chunk embeddings to NULL and retries `generate_embeddings_for_repo`. This works without duplicating chunks. However, if the repository failed earlier during ZIP extraction, `reindex` cannot recover because the ZIP file was already deleted.
- **Do repository status and files remain consistent after failure?** The files and chunks remain in the database with status `failed` and `embedding = NULL`. However, if the server restarts while indexing is in progress, the repository remains in `indexing` indefinitely because there is no task watchdog.

---

## 5. Detailed Reproducible Bug Catalog

### Bug 1: Unhandled `AttributeError` on Repository Sub-Resource Endpoints (P0)
- **Files:** [backend/app/api/routers/repositories.py](file:///Users/omgangwar/Documents/Projects/CodeBase%20AI/backend/app/api/routers/repositories.py#L146-L193)
- **Functions:** `get_repository_files` (L146), `get_file_content` (L160), `get_repository_chunks` (L181), `delete_repository` (L193)
- **Evidence:**
  `get_repository` returns a dictionary:
  ```python
  return { "id": repo.id, "name": repo.name, ... }
  ```
  The caller functions do:
  ```python
  repo = await get_repository(id, current_user, db)
  stmt = select(DBFile).where(DBFile.repository_id == repo.id) # AttributeError: 'dict' object has no attribute 'id'
  ```
- **Impact:** Any call to view files, view file contents in the source modal, inspect chunks, or delete a repository immediately crashes with HTTP 500.

### Bug 2: Missing TypeScript Imports in Repository Page (P1)
- **File:** [app/repository/[id]/page.tsx](file:///Users/omgangwar/Documents/Projects/CodeBase%20AI/app/repository/%5Bid%5D/page.tsx#L149)
- **Line:** 149: `const updated = await updateChatSession(sessionId, newTitle);`
- **Evidence:** `updateChatSession` is defined in `lib/api.ts` (line 179), but was omitted from the import statement at lines 11–22 in `page.tsx`.
- **Command Output:** `error TS2552: Cannot find name 'updateChatSession'. Did you mean 'createChatSession'?`
- **Impact:** Renaming a chat session causes a runtime ReferenceError.

### Bug 3: Missing `summary` Field on `RepositoryDetail` Interface (P1)
- **Files:** [lib/api.ts](file:///Users/omgangwar/Documents/Projects/CodeBase%20AI/lib/api.ts#L29-L33) & [app/repository/[id]/page.tsx](file:///Users/omgangwar/Documents/Projects/CodeBase%20AI/app/repository/%5Bid%5D/page.tsx#L441-L443)
- **Evidence:** `page.tsx` accesses `repo.summary`, but `RepositoryDetail` in `lib/api.ts` does not declare `summary?: string | null`.
- **Command Output:** `error TS2339: Property 'summary' does not exist on type 'RepositoryDetail'.`
- **Impact:** Type checker fails; architecture overview is untyped.

### Bug 4: Dashboard Status Polling Desynchronization (P1)
- **File:** [app/dashboard/page.tsx](file:///Users/omgangwar/Documents/Projects/CodeBase%20AI/app/dashboard/page.tsx#L64-L66)
- **Evidence:**
  ```typescript
  const isProcessing = repositories.some(
    r => r.status === "processing" || r.status === "embedding"
  );
  ```
  Commit `f8a19f01` updated backend status terminology to `"pending"` and `"indexing"`. The frontend still checks `"processing"` and `"embedding"`, making `isProcessing` evaluate to `false` at all times during indexing.
- **Impact:** When a repository is uploaded or indexing, the dashboard never polls for status updates. Users must manually reload the page.

### Bug 5: Ineffective Tenacity Retry Decorator in `GeminiService` (P1)
- **File:** [backend/app/services/gemini_service.py](file:///Users/omgangwar/Documents/Projects/CodeBase%20AI/backend/app/services/gemini_service.py#L65-L104)
- **Evidence:**
  `@retry(retry=retry_if_exception_type(APIError))` wraps `embed_content` and `generate_content`. Inside the functions:
  ```python
  except Exception as e:
      self._handle_api_error(e) # catches APIError and raises HTTPException!
  ```
  Because `_handle_api_error` transforms `APIError` into `HTTPException`, tenacity never catches `APIError`.
- **Impact:** Automatic exponential backoff and retry for transient Gemini rate limits (429) or connection resets are completely non-functional.

### Bug 6: Event Loop Blocking Synchronous Calls (P2)
- **File:** [backend/app/services/gemini_service.py](file:///Users/omgangwar/Documents/Projects/CodeBase%20AI/backend/app/services/gemini_service.py#L75-L101)
- **Evidence:** `embed_content` and `generate_content` call `client.models.embed_content` and `client.models.generate_content` instead of `client.aio.models...`.
- **Impact:** The Python asyncio event loop is blocked on synchronous network sockets during every Gemini call, degrading server throughput.

### Bug 7: Source Citations Not Persisted to Database (P2)
- **Files:** [backend/app/api/routers/chat.py](file:///Users/omgangwar/Documents/Projects/CodeBase%20AI/backend/app/api/routers/chat.py#L217-L221) & [backend/app/models/chat.py](file:///Users/omgangwar/Documents/Projects/CodeBase%20AI/backend/app/models/chat.py#L22-L32)
- **Evidence:**
  `Message` model only stores `id`, `chat_session_id`, `role`, `content`, `created_at`. In `chat.py`, `sources_data` is yielded in the stream, but the saved `Message` record does not store sources. Line 129 in `app/repository/[id]/page.tsx` states: `sources: [] // We might need to persist sources in DB later, for now leave empty on reload`.
- **Impact:** Switching chat sessions or reloading the page permanently wipes out all source citation pills for past answers.

### Bug 8: Chat Message Markdown Formatting and Line-Break Collapse (P2)
- **File:** [components/repository/ChatMessage.tsx](file:///Users/omgangwar/Documents/Projects/CodeBase%20AI/components/repository/ChatMessage.tsx#L12-L24,L89-L93)
- **Evidence:** `renderContent` uses a simplistic regex `(\*\*[^*]+\*\*|`[^`]+`)` and wraps content in `<p className="text-[14px] text-[var(--code-text)] leading-relaxed">`. It does not support headings, lists, code fences (` ``` `), or line breaks.
- **Impact:** Multi-line markdown generated by Gemini collapses into a single continuous wall of text without formatting or code syntax highlighting.

### Bug 9: `html2pdf.js` Type Mismatch (P2)
- **File:** [components/repository/ChatMessage.tsx](file:///Users/omgangwar/Documents/Projects/CodeBase%20AI/components/repository/ChatMessage.tsx#L169)
- **Evidence:** `image: { type: 'jpeg', quality: 0.98 }` triggers TS error: `Type 'string' is not assignable to type '"jpeg" | "png" | "webp" | undefined'`.
- **Command Output:** `error TS2345: Argument of type ... is not assignable to parameter of type 'Html2PdfOptions'`.

---

## 6. Security and Data-Integrity Risks

1. **Zip-Slip Directory Traversal:**
   `extract_and_scan_zip` in `backend/app/services/file_processor.py` invokes `zip_ref.extractall(temp_dir)`. Maliciously crafted ZIP archives containing `../../` entries can write files outside the target directory.
2. **Missing Rate Limiting:**
   No rate limiting middleware (e.g. `slowapi`) is configured on auth endpoints (`/auth/login`, `/auth/register`) or heavy AI endpoints (`/ask`, `/reindex`), exposing the backend to brute-force attacks and denial-of-service/quota exhaustion.
3. **Database Cascading and Orphan Management:**
   While SQLAlchemy models specify `cascade="all, delete-orphan"`, foreign keys in migrations must ensure database-level `ON DELETE CASCADE` is consistently applied so manual SQL deletes or direct modifications do not orphan files or chunks.
4. **GitHub Zipball Path Inconsistency:**
   GitHub zipball downloads create an outer directory with format `{owner}-{repo}-{commit_sha}`. File paths currently retain this prefix (e.g., `octocat-Hello-World-7fd1a60/README.md`), making displayed paths verbose and breaking expected relative path matching.
5. **No Verification of GitHub OAuth State Expiry:**
   OAuth state cookie lacks explicit server-side timestamp validation beyond cookie `max_age`.

---

## 7. Baseline Test & Build Verification Results

| Check | Documented Command | Exit Code | Result | Exact Output / Issue |
| :--- | :--- | :---: | :---: | :--- |
| **Frontend TypeScript** | `npx tsc --noEmit` | `2` | **FAILED** | 11 errors in 3 files (`updateChatSession` missing import, `summary` property missing, `html2pdf` options type mismatch, duplicate `.next` type declarations). |
| **Frontend Lint** | `npm run lint` | — | **BLOCKED / HANGS** | ESLint 9 is installed without `eslint.config.mjs` or `.eslintrc`. Command prompts interactively: `? How would you like to configure ESLint?`. |
| **Frontend Production Build** | `npm run build` | `0` | **ARTIFICIAL PASS** | Compiled in 7.0s, but explicitly logs: `Skipping validation of types` and `Skipping linting` due to `ignoreBuildErrors: true` in `next.config.ts`. |
| **Backend Unit/Integration Tests** | `pytest` | — | **MISSING** | No test runner or test suite exists in the repository. |
| **Backend Alembic Migrations** | `alembic current` | `0` | **PASSED** | Output: `db7f10ace821 (head)`. Schema is at latest migration. |
| **Backend FastAPI Import** | `python -c "from app.main import app"` | `0` | **PASSED** | Application loads without module import errors. |
| **PostgreSQL & pgvector Extension** | `SELECT extname, extversion ...` | `0` | **PASSED** | `pgvector` version `0.7.0` active; vector distance query verified. |

---

## 8. Configuration & External Service Blockers

1. **`GEMINI_API_KEY` (CRITICAL BLOCKER):**
   - Location: `backend/.env`
   - Current Value: Empty string `""`
   - Required For: Embedding generation, RAG retrieval, chat generation, streaming, repository summaries.
   - Without this key: System cannot index any repository or answer any questions.
2. **`GITHUB_CLIENT_ID` & `GITHUB_CLIENT_SECRET` (FEATURE BLOCKER):**
   - Location: `backend/.env`
   - Current Value: Existing test values in `.env` (status unverified against live GitHub app registration).
   - Required For: "Continue with GitHub" OAuth login.
3. **`docker-compose.yml` Postgres Image Discrepancy:**
   - Current: `postgres:15-alpine` (does NOT include `pgvector`).
   - Required: `pgvector/pgvector:pg15` or `ankane/pgvector`.

---

## 9. Prioritized Issue List

| Issue ID | Severity | Category | Description | Affected Files | Dependencies | Acceptance Criteria |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| **ISS-01** | **P0** | Backend Crash | `AttributeError: 'dict' object has no attribute 'id'` on repo sub-resources | `backend/app/api/routers/repositories.py` | None | Files, file content, chunks, and deletion endpoints return HTTP 200/204 without crashing. |
| **ISS-02** | **P0** | AI Pipeline | Missing `GEMINI_API_KEY` causes 503 indexing and chat failures | `backend/.env`, `backend/app/core/config.py` | Valid Gemini API Key | Key loaded properly; embeddings generated; repo transitions to `indexed`. |
| **ISS-03** | **P1** | Frontend Build | 11 TypeScript compilation errors across repository and chat files | `app/repository/[id]/page.tsx`, `lib/api.ts`, `components/repository/ChatMessage.tsx` | None | `npx tsc --noEmit` exits with code 0. |
| **ISS-04** | **P1** | Frontend Tooling | Missing ESLint 9 configuration causes lint command to hang | `package.json`, `eslint.config.mjs` | None | `npm run lint` completes non-interactively without errors. |
| **ISS-05** | **P1** | UI / UX | Status polling broken for `pending` and `indexing` states | `app/dashboard/page.tsx` | None | Dashboard automatically polls every 5s while repos are pending/indexing and updates cards. |
| **ISS-06** | **P1** | Reliability | Broken Tenacity retries and blocking calls in `GeminiService` | `backend/app/services/gemini_service.py` | None | Retries trigger on 429/network errors; async client (`client.aio`) used for all calls. |
| **ISS-07** | **P1** | Data Loss | Chat source citations lost on page reload | `backend/app/models/chat.py`, `backend/app/api/routers/chat.py`, Alembic | DB migration | Sources persisted with messages and restored on reload/session switch. |
| **ISS-08** | **P2** | Ingestion | Zip-Slip vulnerability & unhandled GitHub zipball root directory | `backend/app/services/file_processor.py`, `backend/app/services/github_service.py` | None | ZIP extraction validates path safety; GitHub archive root folder prefix is stripped cleanly. |
| **ISS-09** | **P2** | UI / UX | AI Chat markdown rendered without formatting, code blocks, or linebreaks | `components/repository/ChatMessage.tsx` | None | Chat renders markdown properly with linebreaks, headings, lists, and syntax-highlighted code. |
| **ISS-10** | **P2** | Docker Config | `docker-compose.yml` missing `pgvector` extension image | `docker-compose.yml` | None | `docker compose up` spins up PostgreSQL with `pgvector` pre-installed. |
| **ISS-11** | **P2** | Testing | Complete absence of automated tests | `backend/tests/`, `package.json` | Pytest, Vitest | Core regression test suite passes in CI for auth, ingestion, chunking, retrieval. |
| **ISS-12** | **P3** | UX Polish | Dashboard dead links ("View All", Recent Activity stub) | `app/dashboard/page.tsx`, `components/dashboard/AskAiModal.tsx` | None | Dead links resolved or connected to real data; failed repos displayed correctly in AskAiModal. |

---

## 10. Definition of Done (DoD) for Full Project Completion

The project will be considered **production-ready** when all of the following conditions are met:
1. **Zero Baseline Errors:** `npx tsc --noEmit` and `npm run lint` pass cleanly with zero warnings/errors. Next.js build flags `ignoreBuildErrors` and `ignoreDuringBuilds` are removed.
2. **Complete Vertical Slice:** A user can upload a ZIP or import a GitHub repository, observe live progress (`pending -> indexing -> indexed`), view the file tree and file contents, and query the codebase via streaming AI chat with accurate, clickable source code citations.
3. **Resilient Failure Handling:** Incomplete or failed indexings record actionable error messages in the database and display them in the UI with a working "Re-index" button that recovers without creating duplicate records.
4. **Data Persistence:** Chat sessions, message history, and source citations persist across browser refreshes and session navigation.
5. **Security Baseline:** ZIP extraction is safe against Zip-Slip; API keys are never leaked to client responses or git; user authorization is verified on every repository and chat query.
6. **Automated Test Coverage:** Core unit and integration tests exist for repository parsing, chunking, vector retrieval, and authentication endpoints.
7. **Production Containerization:** `docker-compose.yml` successfully provisions PostgreSQL with `pgvector`, runs database migrations, and supports local reproducible execution.
