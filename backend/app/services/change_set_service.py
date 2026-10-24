import os
import re
import json
import logging
import uuid
from typing import Dict, List, Optional, Set, Any, Tuple
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from app.models import Repository, File
from app.services.impact_analysis_service import (
    analyze_repository_files_ast,
    resolve_import_specifier,
    match_target_file,
    TEST_PATTERN
)
from app.services.gemini_service import gemini_service
from app.core.config import settings

logger = logging.getLogger(__name__)

MAX_DIFF_BYTES = 500 * 1024  # 500 KB limit for diff payloads
MAX_CHANGED_FILES = 50       # Bounded to 50 changed files per analysis

HUNK_HEADER_RE = re.compile(r'^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@')

# Application entry point patterns (Next.js pages/routes, API endpoints, web routers, main entry points)
ENTRY_POINT_PATTERN = re.compile(
    r'(?:^|/)(?:pages/api/|app/api/|pages/|app/|routes/|views/|controllers/|main\.[a-zA-Z0-9]+$|server\.[a-zA-Z0-9]+$)',
    re.IGNORECASE
)


def parse_unified_diff(diff_text: str) -> List[dict]:
    """
    Parses a unified git diff into structured file entries with modified line numbers.
    Handles added, deleted, modified, and renamed files.
    """
    if not diff_text or not diff_text.strip():
        return []

    files: List[dict] = []
    current_file: Optional[dict] = None

    lines = diff_text.splitlines()
    for line in lines:
        if line.startswith("diff --git "):
            parts = line[len("diff --git "):].split(" ")
            if len(parts) >= 2:
                old_p = parts[0][2:] if parts[0].startswith("a/") else parts[0]
                new_p = parts[1][2:] if parts[1].startswith("b/") else parts[1]
                current_file = {
                    "old_path": old_p,
                    "new_path": new_p,
                    "change_type": "modified",
                    "modified_lines": [],
                    "deleted_lines": [],
                    "hunks": [],
                    "raw_diff_lines": [line]
                }
                files.append(current_file)
                continue

        if not current_file:
            if line.startswith("--- "):
                raw = line[4:].strip()
                old_p = None if raw == "/dev/null" else (raw[2:] if raw.startswith("a/") else raw)
                current_file = {
                    "old_path": old_p,
                    "new_path": None,
                    "change_type": "modified",
                    "modified_lines": [],
                    "deleted_lines": [],
                    "hunks": [],
                    "raw_diff_lines": [line]
                }
                files.append(current_file)
                continue

        if current_file:
            current_file["raw_diff_lines"].append(line)

            if line.startswith("--- ") and not current_file.get("old_path"):
                raw = line[4:].strip()
                current_file["old_path"] = None if raw == "/dev/null" else (raw[2:] if raw.startswith("a/") else raw)
            elif line.startswith("+++ "):
                raw = line[4:].strip()
                current_file["new_path"] = None if raw == "/dev/null" else (raw[2:] if raw.startswith("b/") else raw)
                if current_file["old_path"] is None:
                    current_file["change_type"] = "added"
                elif current_file["new_path"] is None:
                    current_file["change_type"] = "deleted"
            elif line.startswith("new file mode"):
                current_file["change_type"] = "added"
            elif line.startswith("deleted file mode"):
                current_file["change_type"] = "deleted"
            elif line.startswith("rename from "):
                current_file["old_path"] = line[len("rename from "):].strip()
                current_file["change_type"] = "renamed"
            elif line.startswith("rename to "):
                current_file["new_path"] = line[len("rename to "):].strip()
            elif line.startswith("@@"):
                m = HUNK_HEADER_RE.match(line)
                if m:
                    old_start = int(m.group(1))
                    new_start = int(m.group(3))
                    current_hunk = {
                        "old_start": old_start,
                        "new_start": new_start,
                        "curr_new": new_start,
                        "curr_old": old_start
                    }
                    current_file["hunks"].append(current_hunk)
            elif current_file["hunks"]:
                h = current_file["hunks"][-1]
                if line.startswith("+") and not line.startswith("+++"):
                    current_file["modified_lines"].append(h["curr_new"])
                    h["curr_new"] += 1
                elif line.startswith("-") and not line.startswith("---"):
                    current_file["deleted_lines"].append(h["curr_old"])
                    h["curr_old"] += 1
                elif line.startswith(" "):
                    h["curr_new"] += 1
                    h["curr_old"] += 1

    # Cleanup snippets (cap raw diff to 60 lines per file for context)
    for f in files:
        f["diff_snippet"] = "\n".join(f.get("raw_diff_lines", [])[:60])

    return files


def detect_changed_symbols(
    target_path: str,
    diff_file: dict,
    file_ast: dict,
    explicit_symbols: Optional[List[str]] = None
) -> Tuple[List[str], bool]:
    """
    Correlates modified lines from the diff with AST declarations and exports.
    Returns: (list_of_changed_symbols, is_public_api_modified)
    """
    changed_symbols_set: Set[str] = set(explicit_symbols or [])
    is_public_api_modified = False

    declarations = file_ast.get("declarations", [])
    exports = file_ast.get("exports", [])
    exported_names = {e["name"] for e in exports}

    # If the file was completely deleted or added, mark all exports as affected
    if diff_file.get("change_type") in ("deleted", "added"):
        if exported_names:
            is_public_api_modified = True
            changed_symbols_set.update(exported_names)
        return sorted(list(changed_symbols_set)), is_public_api_modified

    raw_diff_lines = diff_file.get("raw_diff_lines", [])
    raw_diff_text = "\n".join(raw_diff_lines)

    # 1. Match against declarations mentioned directly in diff hunks / headers
    for decl in declarations:
        d_name = decl["name"]
        if d_name and re.search(r'\b' + re.escape(d_name) + r'\b', raw_diff_text):
            changed_symbols_set.add(d_name)
            if d_name in exported_names or decl.get("is_exported"):
                is_public_api_modified = True

    # 2. Match against exports mentioned directly in diff hunks
    for exp in exports:
        exp_name = exp["name"]
        if exp_name and re.search(r'\b' + re.escape(exp_name) + r'\b', raw_diff_text):
            changed_symbols_set.add(exp_name)
            is_public_api_modified = True

    # 3. Match against line ranges: deleted lines (base file) and modified lines
    deleted_lines = set(diff_file.get("deleted_lines", []))
    modified_lines = set(diff_file.get("modified_lines", []))

    for decl in declarations:
        d_name = decl["name"]
        s_line = decl.get("start_line", 0)
        e_line = decl.get("end_line", s_line)

        # Check line overlap with deleted_lines in base file
        if deleted_lines and any(s_line <= l <= e_line for l in deleted_lines):
            changed_symbols_set.add(d_name)
            if d_name in exported_names or decl.get("is_exported"):
                is_public_api_modified = True
        elif not deleted_lines and any(s_line <= l <= e_line for l in modified_lines):
            # Fallback to modified_lines if no symbol was matched yet
            if not changed_symbols_set:
                changed_symbols_set.add(d_name)
                if d_name in exported_names or decl.get("is_exported"):
                    is_public_api_modified = True

    return sorted(list(changed_symbols_set)), is_public_api_modified


def calculate_risk_prioritization(
    changed_files: List[dict],
    direct_dependents_count: int,
    transitive_dependents_count: int,
    total_blast_radius: int,
    is_any_public_api_modified: bool,
    entry_points_affected: List[str],
    suggested_tests: List[dict],
    has_unresolved_dependencies: bool
) -> dict:
    """
    Computes a transparent, explainable impact risk score and classification.
    Produces: CRITICAL, HIGH, MEDIUM, or LOW with explicit scoring factors.
    """
    score = 0
    factors = []

    # Factor 1: Blast Radius Size
    if direct_dependents_count >= 8:
        pts = 40
        factors.append({
            "factor": "Blast Radius (Direct)",
            "points": pts,
            "reason": f"Broad direct blast radius ({direct_dependents_count} directly dependent files)"
        })
        score += pts
    elif direct_dependents_count >= 3:
        pts = 25
        factors.append({
            "factor": "Blast Radius (Direct)",
            "points": pts,
            "reason": f"Moderate direct blast radius ({direct_dependents_count} directly dependent files)"
        })
        score += pts
    elif direct_dependents_count > 0:
        pts = 10
        factors.append({
            "factor": "Blast Radius (Direct)",
            "points": pts,
            "reason": f"Narrow direct blast radius ({direct_dependents_count} directly dependent files)"
        })
        score += pts

    if transitive_dependents_count > 0:
        trans_pts = min(20, transitive_dependents_count * 5)
        factors.append({
            "factor": "Transitive Propagation",
            "points": trans_pts,
            "reason": f"Propagates to {transitive_dependents_count} downstream transitive files across multiple hops"
        })
        score += trans_pts

    # Factor 2: Public API & Shared Types Modification
    deleted_files = [f for f in changed_files if f.get("change_type") == "deleted"]
    if deleted_files:
        pts = 35
        factors.append({
            "factor": "File Deletion",
            "points": pts,
            "reason": f"{len(deleted_files)} file(s) deleted; existing imports are at immediate risk of breakage"
        })
        score += pts
    elif is_any_public_api_modified:
        pts = 25
        factors.append({
            "factor": "Exported Contract Modified",
            "points": pts,
            "reason": "Change touches exported symbols, public APIs, or shared type definitions"
        })
        score += pts

    # Factor 3: Application Entry Points & API Routes Affected
    if entry_points_affected:
        pts = 20
        factors.append({
            "factor": "Entry Points / Routes Affected",
            "points": pts,
            "reason": f"Blast radius touches {len(entry_points_affected)} entry points or API routes: {', '.join([p.split('/')[-1] for p in entry_points_affected[:3]])}"
        })
        score += pts

    # Factor 4: Test Coverage Presence
    if total_blast_radius > 0:
        if len(suggested_tests) == 0:
            pts = 15
            factors.append({
                "factor": "Test Coverage Gap",
                "points": pts,
                "reason": "No downstream test suites detected to catch regressions in the blast radius"
            })
            score += pts
        else:
            pts = -10
            factors.append({
                "factor": "Test Suites Available",
                "points": pts,
                "reason": f"{len(suggested_tests)} downstream test suite(s) available to verify changes"
            })
            score += pts

    # Factor 5: Unresolved / Dynamic Dependency Uncertainty
    if has_unresolved_dependencies:
        pts = 10
        factors.append({
            "factor": "Unresolved Dependency Uncertainty",
            "points": pts,
            "reason": "Dynamic or unresolvable imports detected; actual blast radius could extend beyond static graph"
        })
        score += pts

    # Bound score to [0, 100]
    final_score = max(5, min(100, score))

    if final_score >= 70:
        risk_level = "CRITICAL"
        explanation = "High risk change set with wide blast radius, public API modifications, or entry points affected without test coverage."
    elif final_score >= 45:
        risk_level = "HIGH"
        explanation = "Elevated risk change set impacting multiple dependent components or shared contracts."
    elif final_score >= 25:
        risk_level = "MEDIUM"
        explanation = "Moderate, localized impact with defined dependents or existing test coverage."
    else:
        risk_level = "LOW"
        explanation = "Low risk change set with minimal or isolated downstream dependencies."

    return {
        "risk_level": risk_level,
        "score": final_score,
        "factors": factors,
        "explanation": explanation,
        "summary_headline": explanation
    }


async def generate_change_set_explanation(
    changed_files: List[dict],
    merged_dependents: List[dict],
    risk_info: dict,
    suggested_tests: List[dict]
) -> Optional[dict]:
    """
    Generates an executive, evidence-backed change set explanation via Gemini-3.8-Flash.
    Strictly bounded by the static blast radius evidence.
    """
    if not settings.GEMINI_API_KEY:
        return None

    # Construct concise evidence summary
    changes_summary = []
    for f in changed_files:
        syms = f.get("changed_symbols", [])
        sym_str = f" (Symbols: {', '.join(syms)})" if syms else ""
        changes_summary.append(f"- `{f['path']}` [{f['change_type']}]{sym_str}")

    dependents_summary = []
    for d in merged_dependents[:15]:
        causes = [f"`{c['changed_file'].split('/')[-1]}` ({c['relationship']})" for c in d.get("caused_by", [])]
        dependents_summary.append(f"- `{d['path']}` (Depth {d['min_depth']}, Caused by: {', '.join(causes)})")

    tests_summary = [f"- `{t['path']}`" for t in suggested_tests] or ["None directly identified."]

    prompt = f"""You are a senior software architect performing Change Set Blast Radius Analysis.

STRICT GROUNDING INSTRUCTIONS:
1. Base your explanation ENTIRELY on the provided static evidence below.
2. DO NOT invent unverified dependencies, external files, or fake test results.
3. Explain why the affected files could break and recommend targeted verification.

PROPOSED CHANGE SET ({len(changed_files)} files):
{chr(10).join(changes_summary)}

STATIC BLAST RADIUS ({len(merged_dependents)} affected files):
{chr(10).join(dependents_summary) if dependents_summary else "No downstream dependents found."}

DETERMINISTIC RISK CLASSIFICATION:
- Level: {risk_info['risk_level']} (Score: {risk_info['score']}/100)
- Assessment: {risk_info['explanation']}

IDENTIFIED RELEVANT TESTS:
{chr(10).join(tests_summary)}

Return your response in valid JSON matching this schema:
{{
  "summary": "Concise 2-3 sentence overview of the change set blast radius and risk posture.",
  "breaking_risks": [
    "Specific potential breaking change or contract regression based on the modified files"
  ],
  "component_impacts": [
    {{
      "component": "Module / File Name",
      "risk": "Description of why and how this component is impacted by the changes"
    }}
  ],
  "verification_checklist": [
    "Targeted manual or automated verification step to guarantee stability"
  ]
}}

Return ONLY valid JSON.
"""

    try:
        raw = await gemini_service.generate_content(
            model=settings.CHAT_MODEL,
            contents=prompt
        )
        cleaned = raw.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        return json.loads(cleaned.strip())
    except Exception as e:
        logger.warning(f"Failed to generate Gemini change set explanation: {e}")
        return None


async def analyze_change_set(
    db: AsyncSession,
    repo_id: uuid.UUID,
    user_id: uuid.UUID,
    diff_text: Optional[str] = None,
    changed_files_input: Optional[List[dict]] = None,
    max_depth: int = 3,
    include_ai_explanation: bool = True
) -> dict:
    """
    Executes Git Diff & Change Set Blast Radius Analysis across a multi-file change set.
    """
    # 1. Input Validation & Boundaries
    if diff_text and len(diff_text.encode("utf-8")) > MAX_DIFF_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Diff payload exceeds maximum allowed size ({MAX_DIFF_BYTES // 1024} KB)."
        )

    max_depth = max(1, min(max_depth or 3, 5))

    # 2. Authorization: verify repository ownership
    repo = (await db.execute(
        select(Repository).where(Repository.id == repo_id, Repository.user_id == user_id)
    )).scalar_one_or_none()

    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found or access denied."
        )

    # 3. Fetch all repository files
    files = (await db.execute(
        select(File).where(File.repository_id == repo_id)
    )).scalars().all()

    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Repository contains no files."
        )

    all_repo_paths = {f.path for f in files}
    file_map_by_path = {f.path: f for f in files}

    # 4. Parse Changed Files (from diff_text or changed_files_input)
    raw_changed_files: List[dict] = []
    if diff_text:
        raw_changed_files = parse_unified_diff(diff_text)
    elif changed_files_input:
        for item in changed_files_input:
            raw_changed_files.append({
                "old_path": item.get("path"),
                "new_path": item.get("path"),
                "change_type": item.get("change_type", "modified"),
                "modified_lines": [],
                "deleted_lines": [],
                "explicit_symbols": item.get("symbols", []),
                "diff_snippet": None
            })

    if not raw_changed_files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No changed files identified. Please supply a valid git diff or list of changed files."
        )

    if len(raw_changed_files) > MAX_CHANGED_FILES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Change set exceeds maximum limit of {MAX_CHANGED_FILES} files ({len(raw_changed_files)} received)."
        )

    # 5. AST Analysis of Repository Files
    parsed_analysis = analyze_repository_files_ast(files)

    # 6. Build Importers Graph (Target -> Importers)
    importers_graph: Dict[str, List[dict]] = {}
    unresolved_dependencies: List[dict] = []

    for file_path, analysis in parsed_analysis.items():
        file_obj = file_map_by_path.get(file_path)
        file_id = str(file_obj.id) if file_obj else None

        for imp in analysis.get("imports", []):
            specifier = imp["specifier"]
            resolved_path = resolve_import_specifier(file_path, specifier, all_repo_paths)

            if resolved_path:
                if resolved_path not in importers_graph:
                    importers_graph[resolved_path] = []

                imported_sym_names = [n["name"] for n in imp.get("named_imports", [])]
                if imp.get("default_import"):
                    imported_sym_names.append(imp["default_import"])
                if imp.get("namespace_import"):
                    imported_sym_names.append(f"* as {imp['namespace_import']}")

                refs_map = {}
                for sym in imported_sym_names:
                    clean = sym.replace("* as ", "")
                    refs = analysis.get("references", {}).get(clean, [])
                    if refs:
                        refs_map[clean] = refs

                importers_graph[resolved_path].append({
                    "importer_path": file_path,
                    "file_id": file_id,
                    "line_number": imp["line"],
                    "imported_symbols": imported_sym_names,
                    "is_type_only": imp.get("is_type_only", False),
                    "is_dynamic": imp.get("is_dynamic", False),
                    "references": refs_map
                })
            else:
                if specifier.startswith("."):
                    unresolved_dependencies.append({
                        "source_file": file_path,
                        "specifier": specifier,
                        "line": imp["line"],
                        "reason": "Relative import path does not resolve to any repository file"
                    })

        for unres in analysis.get("unresolved", []):
            unresolved_dependencies.append({
                "source_file": file_path,
                "specifier": "dynamic_import",
                "line": unres.get("line", 1),
                "reason": unres.get("reason", "Dynamic or non-literal import")
            })

    # 7. Normalize & Analyze Each Changed File
    normalized_changed_files: List[dict] = []
    seen_changed_paths: Set[str] = set()
    is_any_public_api_modified = False

    for cf in raw_changed_files:
        raw_path = cf.get("new_path") or cf.get("old_path") or ""
        matched_path = match_target_file(raw_path, all_repo_paths)

        # If file is added and doesn't exist yet, preserve raw path
        effective_path = matched_path or raw_path
        if effective_path in seen_changed_paths:
            continue
        seen_changed_paths.add(effective_path)

        # Detect changed symbols
        file_ast = parsed_analysis.get(effective_path, {})
        explicit_syms = cf.get("explicit_symbols", [])
        changed_syms, is_api_mod = detect_changed_symbols(
            target_path=effective_path,
            diff_file=cf,
            file_ast=file_ast,
            explicit_symbols=explicit_syms
        )

        if is_api_mod:
            is_any_public_api_modified = True

        normalized_changed_files.append({
            "path": effective_path,
            "change_type": cf.get("change_type", "modified"),
            "changed_symbols": changed_syms,
            "modified_lines_count": len(cf.get("modified_lines", [])),
            "is_public_api_modified": is_api_mod,
            "diff_snippet": cf.get("diff_snippet")
        })

    # 8. Compute Combined Blast Radius Across All Changed Files
    # Map: affected_file_path -> MergedDependentRecord
    merged_map: Dict[str, dict] = {}
    suggested_tests_map: Dict[str, dict] = {}
    entry_points_affected_set: Set[str] = set()

    changed_paths_set = {f["path"] for f in normalized_changed_files}

    for cf in normalized_changed_files:
        src_path = cf["path"]
        cf_syms = cf["changed_symbols"]

        direct_importers = importers_graph.get(src_path, [])
        direct_paths_for_this_file = set()

        for imp in direct_importers:
            imp_path = imp["importer_path"]
            # Exclude self if file is part of changed set
            if imp_path in changed_paths_set and imp_path == src_path:
                continue

            # Symbol matching: if changed symbols are identified, check if importer consumes them
            matches_symbol = True
            if cf_syms:
                matches_symbol = any(
                    s in imp["imported_symbols"]
                    or any(isym.startswith("* as") for isym in imp["imported_symbols"])
                    for s in cf_syms
                )

            # If symbol matches or if module-level import changed
            if matches_symbol or not cf_syms:
                direct_paths_for_this_file.add(imp_path)

                cause_entry = {
                    "changed_file": src_path,
                    "changed_symbols": cf_syms,
                    "relationship": "direct",
                    "depth": 1,
                    "import_line": imp["line_number"]
                }

                if imp_path not in merged_map:
                    merged_map[imp_path] = {
                        "path": imp_path,
                        "file_id": imp["file_id"],
                        "relationship": "direct",
                        "min_depth": 1,
                        "caused_by": [cause_entry],
                        "imported_symbols": list(set(imp["imported_symbols"])),
                        "import_lines": [imp["line_number"]],
                        "dependency_path": [src_path, imp_path]
                    }
                else:
                    rec = merged_map[imp_path]
                    rec["caused_by"].append(cause_entry)
                    rec["imported_symbols"] = list(set(rec["imported_symbols"]).union(imp["imported_symbols"]))
                    if imp["line_number"] not in rec["import_lines"]:
                        rec["import_lines"].append(imp["line_number"])

                # Check if entry point
                if ENTRY_POINT_PATTERN.search(imp_path):
                    entry_points_affected_set.add(imp_path)

                # Check if test
                if TEST_PATTERN.search(imp_path):
                    suggested_tests_map[imp_path] = {
                        "path": imp_path,
                        "reason": f"Directly tests/imports modified module `{src_path.split('/')[-1]}`",
                        "status": "suggested_not_executed"
                    }

        # Transitive Traversal (BFS) starting from direct dependents
        visited: Set[str] = {src_path}.union(direct_paths_for_this_file)
        queue: List[Tuple[str, List[str], int]] = [
            (dp, [src_path, dp], 1) for dp in direct_paths_for_this_file
        ]

        while queue:
            curr_p, path_chain, depth = queue.pop(0)
            if depth >= max_depth:
                continue

            for down in importers_graph.get(curr_p, []):
                down_p = down["importer_path"]
                if down_p not in visited and down_p not in changed_paths_set:
                    visited.add(down_p)
                    new_chain = path_chain + [down_p]
                    new_depth = depth + 1

                    cause_entry = {
                        "changed_file": src_path,
                        "changed_symbols": cf_syms,
                        "relationship": "transitive",
                        "depth": new_depth,
                        "import_line": down["line_number"]
                    }

                    if down_p not in merged_map:
                        merged_map[down_p] = {
                            "path": down_p,
                            "file_id": down["file_id"],
                            "relationship": "transitive",
                            "min_depth": new_depth,
                            "caused_by": [cause_entry],
                            "imported_symbols": list(set(down["imported_symbols"])),
                            "import_lines": [down["line_number"]],
                            "dependency_path": new_chain
                        }
                    else:
                        rec = merged_map[down_p]
                        rec["caused_by"].append(cause_entry)
                        if new_depth < rec["min_depth"]:
                            rec["min_depth"] = new_depth
                            rec["dependency_path"] = new_chain
                        rec["imported_symbols"] = list(set(rec["imported_symbols"]).union(down["imported_symbols"]))
                        if down["line_number"] not in rec["import_lines"]:
                            rec["import_lines"].append(down["line_number"])

                    if ENTRY_POINT_PATTERN.search(down_p):
                        entry_points_affected_set.add(down_p)

                    if TEST_PATTERN.search(down_p):
                        suggested_tests_map[down_p] = {
                            "path": down_p,
                            "reason": f"Transitively exercises components affected by `{src_path.split('/')[-1]}`",
                            "status": "suggested_not_executed"
                        }

                    queue.append((down_p, new_chain, new_depth))

    # Format merged dependents list
    merged_dependents = list(merged_map.values())
    # Sort by min_depth then path
    merged_dependents.sort(key=lambda x: (x["min_depth"], x["path"]))

    direct_count = sum(1 for d in merged_dependents if d["relationship"] == "direct")
    transitive_count = len(merged_dependents) - direct_count
    total_blast = len(merged_dependents)
    suggested_tests = list(suggested_tests_map.values())

    # 9. Deterministic Risk Prioritization
    risk_info = calculate_risk_prioritization(
        changed_files=normalized_changed_files,
        direct_dependents_count=direct_count,
        transitive_dependents_count=transitive_count,
        total_blast_radius=total_blast,
        is_any_public_api_modified=is_any_public_api_modified,
        entry_points_affected=sorted(list(entry_points_affected_set)),
        suggested_tests=suggested_tests,
        has_unresolved_dependencies=bool(unresolved_dependencies)
    )

    # 10. AI Grounded Explanation
    ai_explanation = None
    if include_ai_explanation:
        ai_explanation = await generate_change_set_explanation(
            changed_files=normalized_changed_files,
            merged_dependents=merged_dependents,
            risk_info=risk_info,
            suggested_tests=suggested_tests
        )

    # 11. Compile Limitations
    limitations = [
        "Static analysis is limited to repository-internal files. Third-party package side-effects are not tracked.",
        "Dynamic imports with non-literal string expressions cannot be statically resolved.",
        "Suggested tests are identified from downstream dependency paths; tests are NOT automatically executed by this analysis.",
        "Absence of static dependency does not guarantee absolute safety (e.g. reflection, runtime string lookups, or global state)."
    ]
    if not settings.GEMINI_API_KEY and include_ai_explanation:
        limitations.append("AI explanation was skipped because GEMINI_API_KEY is not configured.")

    max_depth_reached = max([d["min_depth"] for d in merged_dependents], default=0)

    return {
        "repository_id": str(repo.id),
        "summary": {
            "changed_files_count": len(normalized_changed_files),
            "direct_dependents_count": direct_count,
            "transitive_dependents_count": transitive_count,
            "total_blast_radius": total_blast,
            "suggested_tests_count": len(suggested_tests),
            "max_depth_reached": max_depth_reached
        },
        "risk_prioritization": risk_info,
        "changed_files": normalized_changed_files,
        "merged_dependents": merged_dependents,
        "suggested_tests": suggested_tests,
        "unresolved_dependencies": unresolved_dependencies,
        "ai_explanation": ai_explanation,
        "limitations": limitations
    }
