import uuid
import pytest
from app.models.repository import Repository
from app.models.file import File
from app.services.change_set_service import (
    parse_unified_diff,
    detect_changed_symbols,
    calculate_risk_prioritization,
    analyze_change_set
)


def test_parse_unified_diff_multi_file():
    diff = """diff --git a/src/models/user.ts b/src/models/user.ts
index 1111..2222 100644
--- a/src/models/user.ts
+++ b/src/models/user.ts
@@ -10,4 +10,6 @@ export interface User {
   name: string;
+  role: string;
+  active: boolean;
 }
diff --git a/src/legacy.ts b/src/legacy.ts
deleted file mode 100644
--- a/src/legacy.ts
+++ /dev/null
@@ -1,5 +0,0 @@
-export const oldCode = true;
diff --git a/src/new_feature.ts b/src/new_feature.ts
new file mode 100644
--- /dev/null
+++ b/src/new_feature.ts
@@ -0,0 +1,5 @@
+export const newFeature = true;
"""
    parsed = parse_unified_diff(diff)
    assert len(parsed) == 3

    # Modified file
    f1 = parsed[0]
    assert f1["new_path"] == "src/models/user.ts"
    assert f1["change_type"] == "modified"
    assert 12 in f1["modified_lines"]

    # Deleted file
    f2 = parsed[1]
    assert f2["old_path"] == "src/legacy.ts"
    assert f2["change_type"] == "deleted"

    # Added file
    f3 = parsed[2]
    assert f3["new_path"] == "src/new_feature.ts"
    assert f3["change_type"] == "added"


def test_detect_changed_symbols():
    diff_file = {
        "change_type": "modified",
        "modified_lines": [15, 16],
        "deleted_lines": [15],
        "raw_diff_lines": ["+ export function updateProfile() {"]
    }
    file_ast = {
        "declarations": [
            {"name": "getUser", "start_line": 5, "end_line": 10, "kind": "function", "is_exported": True},
            {"name": "updateProfile", "start_line": 14, "end_line": 20, "kind": "function", "is_exported": True}
        ],
        "exports": [
            {"name": "getUser", "line": 5, "kind": "function"},
            {"name": "updateProfile", "line": 14, "kind": "function"}
        ]
    }

    symbols, is_api_mod = detect_changed_symbols(
        target_path="src/user.ts",
        diff_file=diff_file,
        file_ast=file_ast
    )

    assert "updateProfile" in symbols
    assert "getUser" not in symbols
    assert is_api_mod is True


def test_deterministic_risk_prioritization_scoring():
    # 1. High risk scenario: public API modified, 5 direct dependents, entry point affected, no tests
    risk_high = calculate_risk_prioritization(
        changed_files=[{"path": "src/api.ts", "change_type": "modified"}],
        direct_dependents_count=5,
        transitive_dependents_count=3,
        total_blast_radius=8,
        is_any_public_api_modified=True,
        entry_points_affected=["pages/api/submit.ts"],
        suggested_tests=[],
        has_unresolved_dependencies=False
    )
    assert risk_high["risk_level"] in ("HIGH", "CRITICAL")
    assert risk_high["score"] >= 50
    factors = [f["factor"] for f in risk_high["factors"]]
    assert "Exported Contract Modified" in factors
    assert "Entry Points / Routes Affected" in factors
    assert "Test Coverage Gap" in factors

    # 2. Low risk scenario: 1 direct dependent, no public API, test suite available
    risk_low = calculate_risk_prioritization(
        changed_files=[{"path": "src/helper.ts", "change_type": "modified"}],
        direct_dependents_count=1,
        transitive_dependents_count=0,
        total_blast_radius=1,
        is_any_public_api_modified=False,
        entry_points_affected=[],
        suggested_tests=[{"path": "tests/helper.test.ts"}],
        has_unresolved_dependencies=False
    )
    assert risk_low["risk_level"] in ("LOW", "MEDIUM")
    assert risk_low["score"] < 45


@pytest.mark.asyncio
async def test_multi_file_change_set_merged_impact(db_session, test_user_a):
    """
    Test multi-file change set where changes in two separate files impact overlapping downstream files.
    Asserts merged dependents deduplication and distinct 'caused_by' records.
    """
    repo = Repository(
        id=uuid.uuid4(),
        user_id=test_user_a.id,
        name="multi-change-repo",
        status="indexed"
    )
    db_session.add(repo)
    await db_session.flush()

    # File A: models/poll.ts
    f_poll = File(
        repository_id=repo.id,
        path="src/models/poll.ts",
        language="TypeScript",
        size=200,
        content="export interface Poll { id: string; title: string; }\nexport const DEFAULT_OPEN = true;"
    )
    # File B: utils/api.ts
    f_api = File(
        repository_id=repo.id,
        path="src/utils/api.ts",
        language="TypeScript",
        size=200,
        content="import { Poll } from '../models/poll';\nexport function fetchPoll(id: string): Poll { return { id, title: 'test' }; }"
    )
    # File C: pages/poll.tsx (imports BOTH models/poll.ts AND utils/api.ts)
    f_page = File(
        repository_id=repo.id,
        path="src/pages/poll.tsx",
        language="TypeScript",
        size=300,
        content="import { Poll } from '../models/poll';\nimport { fetchPoll } from '../utils/api';\nexport default function Page() { return null; }"
    )
    # File D: tests/poll.test.ts (imports utils/api.ts)
    f_test = File(
        repository_id=repo.id,
        path="src/tests/poll.test.ts",
        language="TypeScript",
        size=200,
        content="import { fetchPoll } from '../utils/api';\n// test goes here"
    )

    db_session.add_all([f_poll, f_api, f_page, f_test])
    await db_session.commit()

    # Change set modifying BOTH models/poll.ts and utils/api.ts
    diff = """diff --git a/src/models/poll.ts b/src/models/poll.ts
--- a/src/models/poll.ts
+++ b/src/models/poll.ts
@@ -1,3 +1,4 @@
 export interface Poll { id: string; title: string;
+  votes?: number;
 }
diff --git a/src/utils/api.ts b/src/utils/api.ts
--- a/src/utils/api.ts
+++ b/src/utils/api.ts
@@ -1,3 +1,4 @@
 import { Poll } from '../models/poll';
-export function fetchPoll(id: string): Poll { return { id, title: 'test' }; }
+export function fetchPoll(id: string, auth?: boolean): Poll { return { id, title: 'test' }; }
"""

    res = await analyze_change_set(
        db=db_session,
        repo_id=repo.id,
        user_id=test_user_a.id,
        diff_text=diff,
        max_depth=3,
        include_ai_explanation=False
    )

    assert res["summary"]["changed_files_count"] == 2
    # pages/poll.tsx is affected by BOTH changed files, but must appear ONCE in merged_dependents
    merged_paths = [d["path"] for d in res["merged_dependents"]]
    assert "src/pages/poll.tsx" in merged_paths
    assert len([p for p in merged_paths if p == "src/pages/poll.tsx"]) == 1

    # Check caused_by links on pages/poll.tsx
    page_rec = next(d for d in res["merged_dependents"] if d["path"] == "src/pages/poll.tsx")
    causes = [c["changed_file"] for c in page_rec["caused_by"]]
    assert "src/models/poll.ts" in causes
    assert "src/utils/api.ts" in causes

    # Suggested tests detected
    suggested_test_paths = [t["path"] for t in res["suggested_tests"]]
    assert "src/tests/poll.test.ts" in suggested_test_paths


@pytest.mark.asyncio
async def test_change_set_endpoint_authorized(client, auth_headers_a, db_session, test_user_a):
    """Test POST /repositories/{id}/change-set-impact returns structured response."""
    repo = Repository(
        id=uuid.uuid4(),
        user_id=test_user_a.id,
        name="endpoint-change-repo",
        status="indexed"
    )
    db_session.add(repo)
    await db_session.flush()

    f1 = File(
        repository_id=repo.id,
        path="src/calc.ts",
        language="TypeScript",
        size=100,
        content="export function add(a: number, b: number) { return a + b; }"
    )
    f2 = File(
        repository_id=repo.id,
        path="src/app.tsx",
        language="TypeScript",
        size=150,
        content="import { add } from './calc';\nconst val = add(1, 2);"
    )
    db_session.add_all([f1, f2])
    await db_session.commit()

    payload = {
        "changed_files": [
            {"path": "src/calc.ts", "change_type": "modified", "symbols": ["add"]}
        ],
        "max_depth": 2,
        "include_ai_explanation": False
    }

    res = await client.post(
        f"/repositories/{repo.id}/change-set-impact",
        headers=auth_headers_a,
        json=payload
    )

    assert res.status_code == 200
    data = res.json()
    assert data["summary"]["changed_files_count"] == 1
    assert data["summary"]["direct_dependents_count"] == 1
    assert data["merged_dependents"][0]["path"] == "src/app.tsx"
    assert data["risk_prioritization"]["risk_level"] in ("LOW", "MEDIUM", "HIGH", "CRITICAL")


@pytest.mark.asyncio
async def test_change_set_cross_user_forbidden(client, auth_headers_b, db_session, test_user_a):
    """User B cannot perform change set impact analysis on User A's repository."""
    repo = Repository(
        id=uuid.uuid4(),
        user_id=test_user_a.id,
        name="private-change-repo",
        status="indexed"
    )
    db_session.add(repo)
    await db_session.commit()

    payload = {
        "changed_files": [{"path": "src/foo.ts"}],
        "include_ai_explanation": False
    }

    res = await client.post(
        f"/repositories/{repo.id}/change-set-impact",
        headers=auth_headers_b,
        json=payload
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_change_set_empty_input_rejected(client, auth_headers_a, db_session, test_user_a):
    """Empty change set input raises 400 Bad Request."""
    repo = Repository(
        id=uuid.uuid4(),
        user_id=test_user_a.id,
        name="empty-change-repo",
        status="indexed"
    )
    db_session.add(repo)
    await db_session.commit()

    res = await client.post(
        f"/repositories/{repo.id}/change-set-impact",
        headers=auth_headers_a,
        json={"diff_text": "", "include_ai_explanation": False}
    )
    assert res.status_code == 400
