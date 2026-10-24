import uuid
import pytest
from app.models.repository import Repository
from app.models.file import File
from app.models.chunk import Chunk
from app.core.config import settings
from app.services.impact_analysis_service import (
    resolve_import_specifier,
    match_target_file,
    parse_python_file,
    parse_js_ts_fallback,
    analyze_change_impact
)


def test_resolve_import_specifier_relative():
    repo_paths = {
        "samay-main/src/models/poll.ts",
        "samay-main/src/utils/db.ts",
        "samay-main/src/components/copyText/index.tsx",
        "samay-main/pages/api/poll/create.ts"
    }

    # Relative import with ../
    res = resolve_import_specifier(
        importer_path="samay-main/pages/api/poll/create.ts",
        specifier="../../../src/models/poll",
        all_repo_paths=repo_paths
    )
    assert res == "samay-main/src/models/poll.ts"

    # Directory index import
    res_index = resolve_import_specifier(
        importer_path="samay-main/src/components/Layout.tsx",
        specifier="./copyText",
        all_repo_paths=repo_paths
    )
    assert res_index == "samay-main/src/components/copyText/index.tsx"

    # Aliased import with @/
    res_alias = resolve_import_specifier(
        importer_path="samay-main/pages/index.tsx",
        specifier="@/src/utils/db",
        all_repo_paths=repo_paths
    )
    assert res_alias == "samay-main/src/utils/db.ts"


def test_match_target_file():
    repo_paths = {
        "samay-main/src/models/poll.ts",
        "samay-main/pages/api/poll/create.ts"
    }

    assert match_target_file("samay-main/src/models/poll.ts", repo_paths) == "samay-main/src/models/poll.ts"
    assert match_target_file("src/models/poll.ts", repo_paths) == "samay-main/src/models/poll.ts"
    assert match_target_file("models/poll.ts", repo_paths) == "samay-main/src/models/poll.ts"
    assert match_target_file("nonexistent.ts", repo_paths) is None


def test_python_ast_parser():
    py_code = """
import os
from datetime import datetime as dt
from .helpers import format_time

def process_item(item):
    t = format_time(item)
    return dt.now()

class ItemManager:
    pass
"""
    result = parse_python_file("app/main.py", py_code)
    exports = [e["name"] for e in result["exports"]]
    assert "process_item" in exports
    assert "ItemManager" in exports
    assert any(imp["specifier"] == ".helpers" for imp in result["imports"])
    assert "format_time" in result["references"]


def test_js_ts_fallback_parser():
    code = """
import Layout from "./Layout";
import { encrypt, decrypt as dec } from "../helpers";
import * as dayjs from "dayjs";
const config = require("./config");
"""
    result = parse_js_ts_fallback("src/index.ts", code)
    imports = result["imports"]
    assert len(imports) == 4
    assert imports[0]["default_import"] == "Layout"
    assert imports[0]["specifier"] == "./Layout"
    named = imports[1]["named_imports"]
    assert any(n["name"] == "encrypt" for n in named)
    assert any(n["name"] == "decrypt" and n["alias"] == "dec" for n in named)
    assert imports[2]["namespace_import"] == "dayjs"
    assert imports[3]["specifier"] == "./config"


@pytest.mark.asyncio
async def test_impact_analysis_lifecycle_and_cycles(db_session, test_user_a):
    """
    Test direct & transitive discovery, cycle detection (A -> B -> A),
    and suggested test detection with known fixtures.
    """
    repo = Repository(
        id=uuid.uuid4(),
        user_id=test_user_a.id,
        name="cycle-test-repo",
        status="indexed"
    )
    db_session.add(repo)
    await db_session.flush()

    # Create files:
    # target: models/user.ts
    # direct 1: services/auth.ts (imports models/user.ts)
    # direct 2: api/login.ts (imports models/user.ts)
    # transitive: pages/dashboard.tsx (imports services/auth.ts)
    # cycle: services/auth.ts imports api/login.ts AND api/login.ts imports services/auth.ts
    # test file: tests/auth.test.ts (imports services/auth.ts)
    f_user = File(
        repository_id=repo.id,
        path="src/models/user.ts",
        language="TypeScript",
        size=200,
        content="export interface UserProfile { id: string; name: string; }\nexport const DEFAULT_ROLE = 'user';"
    )
    f_auth = File(
        repository_id=repo.id,
        path="src/services/auth.ts",
        language="TypeScript",
        size=300,
        content="import { UserProfile } from '../models/user';\nimport { handleLogin } from '../api/login';\nexport function loginUser(u: UserProfile) { return handleLogin(u); }"
    )
    f_login = File(
        repository_id=repo.id,
        path="src/api/login.ts",
        language="TypeScript",
        size=300,
        content="import { UserProfile, DEFAULT_ROLE } from '../models/user';\nimport { loginUser } from '../services/auth';\nexport function handleLogin(u: UserProfile) { return u.name; }"
    )
    f_dash = File(
        repository_id=repo.id,
        path="src/pages/dashboard.tsx",
        language="TypeScript",
        size=250,
        content="import { loginUser } from '../services/auth';\nexport default function Dashboard() { return null; }"
    )
    f_test = File(
        repository_id=repo.id,
        path="src/tests/auth.test.ts",
        language="TypeScript",
        size=250,
        content="import { loginUser } from '../services/auth';\n// test goes here"
    )

    db_session.add_all([f_user, f_auth, f_login, f_dash, f_test])
    await db_session.commit()

    # 1. Full file analysis
    result = await analyze_change_impact(
        db=db_session,
        repo_id=repo.id,
        user_id=test_user_a.id,
        target_file_path="src/models/user.ts",
        symbol_name=None,
        max_depth=3,
        include_ai_explanation=False
    )

    assert result["target"]["path"] == "src/models/user.ts"
    assert "UserProfile" in result["target"]["exported_symbols"]
    assert "DEFAULT_ROLE" in result["target"]["exported_symbols"]

    # Direct dependents: auth.ts and login.ts
    direct_paths = [d["path"] for d in result["direct_dependents"]]
    assert "src/services/auth.ts" in direct_paths
    assert "src/api/login.ts" in direct_paths
    assert len(direct_paths) == 2

    # Transitive dependents: dashboard.tsx and tests/auth.test.ts
    # (Cycles between auth.ts and login.ts are safely broken by visited set)
    transitive_paths = [t["path"] for t in result["transitive_dependents"]]
    assert "src/pages/dashboard.tsx" in transitive_paths
    assert "src/tests/auth.test.ts" in transitive_paths

    # Suggested tests: tests/auth.test.ts
    assert "src/tests/auth.test.ts" in result["suggested_tests"]

    # 2. Symbol-specific analysis: DEFAULT_ROLE
    # auth.ts does NOT import DEFAULT_ROLE; only login.ts imports DEFAULT_ROLE
    sym_result = await analyze_change_impact(
        db=db_session,
        repo_id=repo.id,
        user_id=test_user_a.id,
        target_file_path="src/models/user.ts",
        symbol_name="DEFAULT_ROLE",
        max_depth=3,
        include_ai_explanation=False
    )
    sym_direct_paths = [d["path"] for d in sym_result["direct_dependents"]]
    assert sym_direct_paths == ["src/api/login.ts"]


@pytest.mark.asyncio
async def test_impact_analysis_endpoint_authorized(client, auth_headers_a, db_session, test_user_a):
    """Test HTTP API endpoint returns structured ImpactAnalysisResponse."""
    repo = Repository(
        id=uuid.uuid4(),
        user_id=test_user_a.id,
        name="api-impact-repo",
        status="indexed"
    )
    db_session.add(repo)
    await db_session.flush()

    f1 = File(
        repository_id=repo.id,
        path="src/utils/math.ts",
        language="TypeScript",
        size=100,
        content="export function add(a: number, b: number) { return a + b; }"
    )
    f2 = File(
        repository_id=repo.id,
        path="src/components/Calculator.tsx",
        language="TypeScript",
        size=150,
        content="import { add } from '../utils/math';\nconst val = add(2, 3);"
    )
    db_session.add_all([f1, f2])
    await db_session.commit()

    payload = {
        "file_path": "src/utils/math.ts",
        "symbol_name": "add",
        "max_depth": 2,
        "include_ai_explanation": False
    }

    res = await client.post(
        f"/repositories/{repo.id}/impact-analysis",
        headers=auth_headers_a,
        json=payload
    )

    assert res.status_code == 200
    data = res.json()
    assert data["target"]["path"] == "src/utils/math.ts"
    assert data["summary"]["direct_count"] == 1
    assert data["direct_dependents"][0]["path"] == "src/components/Calculator.tsx"
    assert "add" in data["direct_dependents"][0]["imported_symbols"]


@pytest.mark.asyncio
async def test_impact_analysis_cross_user_forbidden(client, auth_headers_b, db_session, test_user_a):
    """User B cannot perform impact analysis on User A's repository."""
    repo = Repository(
        id=uuid.uuid4(),
        user_id=test_user_a.id,
        name="private-repo",
        status="indexed"
    )
    db_session.add(repo)
    await db_session.commit()

    payload = {
        "file_path": "src/dummy.ts",
        "include_ai_explanation": False
    }

    res = await client.post(
        f"/repositories/{repo.id}/impact-analysis",
        headers=auth_headers_b,
        json=payload
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_impact_analysis_nonexistent_file(client, auth_headers_a, db_session, test_user_a):
    """Requesting impact analysis on a non-existent file returns 404."""
    repo = Repository(
        id=uuid.uuid4(),
        user_id=test_user_a.id,
        name="exists-repo",
        status="indexed"
    )
    db_session.add(repo)
    await db_session.commit()

    f = File(
        repository_id=repo.id,
        path="src/main.ts",
        language="TypeScript",
        size=50,
        content="console.log('hi');"
    )
    db_session.add(f)
    await db_session.commit()

    payload = {
        "file_path": "src/does_not_exist.ts",
        "include_ai_explanation": False
    }

    res = await client.post(
        f"/repositories/{repo.id}/impact-analysis",
        headers=auth_headers_a,
        json=payload
    )
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()
