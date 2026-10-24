import os
import ast
import json
import logging
import re
import subprocess
import uuid
from typing import Dict, List, Optional, Set, Any, Tuple
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from app.models import Repository, File
from app.services.gemini_service import gemini_service
from app.core.config import settings

logger = logging.getLogger(__name__)

# Supported code extensions for dependency analysis
TS_JS_EXTS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}
PY_EXTS = {".py"}
RESOLVABLE_EXTS = ["", ".ts", ".tsx", ".js", ".jsx", ".d.ts", ".json", ".py", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"]

TEST_PATTERN = re.compile(
    r'(?:^|/)tests?/|(?:^|/)__tests__/|\.(?:test|spec)\.[a-zA-Z0-9]+$|^test_.*\.py$',
    re.IGNORECASE
)


def _get_ts_parser_path() -> str:
    """Returns absolute path to ts_ast_parser.js."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_dir, "ts_ast_parser.js")


def parse_python_file(path: str, content: str) -> dict:
    """Syntax-aware Python AST parser for import and symbol analysis."""
    exports = []
    imports = []
    references = {}
    unresolved = []

    try:
        tree = ast.parse(content, filename=path)
    except SyntaxError as e:
        return {
            "path": path,
            "exports": [],
            "imports": [],
            "unresolved": [{"line": e.lineno or 1, "reason": f"SyntaxError in Python: {e.msg}"}],
            "references": {}
        }

    lines = content.splitlines()

    declarations = []
    for node in ast.iter_child_nodes(tree):
        # Top-level functions & classes
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            exports.append({"name": node.name, "line": node.lineno, "kind": "function", "is_default": False})
            declarations.append({
                "name": node.name,
                "start_line": node.lineno,
                "end_line": getattr(node, "end_lineno", node.lineno),
                "kind": "function",
                "is_exported": not node.name.startswith("_")
            })
        elif isinstance(node, ast.ClassDef):
            exports.append({"name": node.name, "line": node.lineno, "kind": "class", "is_default": False})
            declarations.append({
                "name": node.name,
                "start_line": node.lineno,
                "end_line": getattr(node, "end_lineno", node.lineno),
                "kind": "class",
                "is_exported": not node.name.startswith("_")
            })
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    exports.append({"name": target.id, "line": node.lineno, "kind": "variable", "is_default": False})
                    declarations.append({
                        "name": target.id,
                        "start_line": node.lineno,
                        "end_line": getattr(node, "end_lineno", node.lineno),
                        "kind": "variable",
                        "is_exported": not target.id.startswith("_")
                    })

        # Imports
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.append({
                    "specifier": alias.name,
                    "line": node.lineno,
                    "default_import": alias.asname or alias.name,
                    "named_imports": [],
                    "namespace_import": None,
                    "is_type_only": False,
                    "is_dynamic": False
                })
        elif isinstance(node, ast.ImportFrom):
            module_name = node.module or ""
            dots = "." * node.level
            specifier = f"{dots}{module_name}"
            named_imports = [{"name": n.name, "alias": n.asname or n.name, "is_type_only": False} for n in node.names]
            imports.append({
                "specifier": specifier,
                "line": node.lineno,
                "default_import": None,
                "named_imports": named_imports,
                "namespace_import": None,
                "is_type_only": False,
                "is_dynamic": False
            })

    # Collect name references across all nodes
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            name = node.id
            if name not in references:
                references[name] = []
            if node.lineno not in references[name]:
                references[name].append(node.lineno)

    for k in references:
        references[k].sort()

    return {
        "path": path,
        "exports": exports,
        "declarations": declarations,
        "imports": imports,
        "unresolved": unresolved,
        "references": references
    }


def parse_js_ts_fallback(path: str, content: str) -> dict:
    """Regex/token fallback parser for JS/TS when Node is unavailable."""
    exports = []
    declarations = []
    imports = []
    unresolved = []
    references = {}

    import_re = re.compile(
        r'''(?:import\s+(?:(\*\s+as\s+[\w$]+|[\w$]+|\{[^}]*\})\s+from\s+)?['"]([^'"]+)['"])|(?:require\s*\(\s*['"]([^'"]+)['"]\s*\))''',
        re.MULTILINE
    )

    lines = content.splitlines()
    for idx, line in enumerate(lines, start=1):
        stripped = line.strip()
        if stripped.startswith("//") or stripped.startswith("/*"):
            continue

        match = import_re.search(line)
        if match:
            clause = match.group(1) or ""
            specifier = match.group(2) or match.group(3) or ""
            default_import = None
            named_imports = []
            namespace_import = None

            if clause.startswith("* as "):
                namespace_import = clause.replace("* as ", "").strip()
            elif clause.startswith("{") and clause.endswith("}"):
                raw_names = clause[1:-1].split(",")
                for n in raw_names:
                    parts = [p.strip() for p in n.split(" as ") if p.strip()]
                    if len(parts) == 2:
                        named_imports.append({"name": parts[0], "alias": parts[1], "is_type_only": False})
                    elif len(parts) == 1:
                        named_imports.append({"name": parts[0], "alias": parts[0], "is_type_only": False})
            elif clause:
                default_import = clause.strip()

            imports.append({
                "specifier": specifier,
                "line": idx,
                "default_import": default_import,
                "named_imports": named_imports,
                "namespace_import": namespace_import,
                "is_type_only": "type" in line,
                "is_dynamic": False
            })

    return {
        "path": path,
        "exports": exports,
        "declarations": declarations,
        "imports": imports,
        "unresolved": unresolved,
        "references": references
    }


def analyze_repository_files_ast(files: List[File]) -> Dict[str, dict]:
    """
    Parses all code files in the repository using syntax-aware AST parsers.
    Uses ts_ast_parser.js for JS/TS files, and Python ast for .py files.
    """
    results: Dict[str, dict] = {}
    ts_js_files: List[dict] = []

    for f in files:
        path = f.path
        content = f.content or ""
        ext = os.path.splitext(path)[1].lower()

        if ext in PY_EXTS:
            results[path] = parse_python_file(path, content)
        elif ext in TS_JS_EXTS:
            ts_js_files.append({"path": path, "content": content})
        else:
            # Non-code or unsupported files
            results[path] = {
                "path": path,
                "exports": [],
                "imports": [],
                "unresolved": [],
                "references": {}
            }

    if ts_js_files:
        parser_script = _get_ts_parser_path()
        try:
            proc = subprocess.run(
                ["node", parser_script],
                input=json.dumps({"files": ts_js_files}),
                capture_output=True,
                text=True,
                timeout=30
            )
            if proc.returncode == 0:
                parsed_data = json.loads(proc.stdout)
                for path, data in parsed_data.get("files", {}).items():
                    results[path] = data
            else:
                logger.warning(f"ts_ast_parser failed with code {proc.returncode}: {proc.stderr}. Falling back to regex.")
                for f in ts_js_files:
                    results[f["path"]] = parse_js_ts_fallback(f["path"], f["content"])
        except Exception as e:
            logger.warning(f"Failed to execute ts_ast_parser.js ({e}). Falling back to regex parser.")
            for f in ts_js_files:
                results[f["path"]] = parse_js_ts_fallback(f["path"], f["content"])

    return results


def resolve_import_specifier(
    importer_path: str,
    specifier: str,
    all_repo_paths: Set[str],
    path_aliases: Optional[Dict[str, str]] = None
) -> Optional[str]:
    """
    Resolves a relative or aliased module specifier to a concrete repository file path.
    Handles:
    - Relative imports: `./foo`, `../bar`
    - Path aliases: `@/utils/db` -> `samay-main/src/utils/db` or `samay-main/utils/db`
    - Extensions: `.ts`, `.tsx`, `.js`, `.jsx`, `.d.ts`, `.json`, `.py`
    - Directory index resolution: `./components` -> `./components/index.tsx`
    """
    if not specifier:
        return None

    importer_dir = os.path.dirname(importer_path)
    candidate_paths: List[str] = []

    if specifier.startswith("."):
        # Relative import
        base_target = os.path.normpath(os.path.join(importer_dir, specifier))
        candidate_paths.append(base_target)
    elif specifier.startswith(("@/", "~/")):
        # Path alias (Next.js / Vite standard)
        # Determine root directory from importer path
        parts = importer_path.split("/")
        repo_prefix = parts[0] if len(parts) > 1 else ""
        subpath = specifier[2:]
        if repo_prefix:
            candidate_paths.append(os.path.normpath(os.path.join(repo_prefix, subpath)))
            candidate_paths.append(os.path.normpath(os.path.join(repo_prefix, "src", subpath)))
        candidate_paths.append(os.path.normpath(subpath))
        candidate_paths.append(os.path.normpath(os.path.join("src", subpath)))
    elif path_aliases and any(specifier.startswith(a) for a in path_aliases):
        for alias, target in path_aliases.items():
            if specifier.startswith(alias):
                rel = specifier[len(alias):].lstrip("/")
                candidate_paths.append(os.path.normpath(os.path.join(target, rel)))

    for candidate in candidate_paths:
        for ext in RESOLVABLE_EXTS:
            test_path = candidate + ext
            if test_path in all_repo_paths:
                return test_path

    return None


def match_target_file(query_path: str, all_repo_paths: Set[str]) -> Optional[str]:
    """
    Finds exact or best matching repository path for a requested target file.
    Accepts: 'samay-main/src/models/poll.ts', 'src/models/poll.ts', or 'models/poll.ts'.
    """
    clean_query = query_path.strip().lstrip("/")
    if clean_query in all_repo_paths:
        return clean_query

    # Try suffix matching
    matches = [p for p in all_repo_paths if p.endswith("/" + clean_query) or p == clean_query]
    if len(matches) == 1:
        return matches[0]
    elif len(matches) > 1:
        # Prioritize shortest path
        matches.sort(key=len)
        return matches[0]

    return None


async def generate_impact_explanation(
    target_path: str,
    symbol_name: Optional[str],
    direct_dependents: List[dict],
    transitive_dependents: List[dict],
    suggested_tests: List[str]
) -> Optional[dict]:
    """
    Generates a grounded explanation using Gemini-3.8-Flash based STRICTLY on the static dependency graph.
    """
    if not settings.GEMINI_API_KEY:
        logger.info("GEMINI_API_KEY not configured; omitting AI explanation.")
        return None

    # Construct strict evidence context
    direct_summary = []
    for d in direct_dependents:
        sym_str = ", ".join(d.get("imported_symbols", [])) or "default/module import"
        direct_summary.append(f"- File: `{d['path']}` (Imported at Line {d['line_number']}, Symbols: [{sym_str}])")

    transitive_summary = []
    for t in transitive_dependents:
        chain = " -> ".join([f"`{p.split('/')[-1]}`" for p in t.get("dependency_path", [])])
        transitive_summary.append(f"- File: `{t['path']}` (Depth {t['depth']}, Dependency Chain: {chain})")

    tests_summary = [f"- `{t}`" for t in suggested_tests] or ["None directly identified."]

    target_display = f"`{target_path}`"
    if symbol_name:
        target_display += f" (Symbol: `{symbol_name}`)"

    evidence_text = f"""TARGET TO MODIFY:
{target_display}

DIRECTLY AFFECTED DOWNSTREAM FILES ({len(direct_dependents)}):
{chr(10).join(direct_summary) if direct_summary else "No direct dependents found."}

TRANSITIVELY AFFECTED DOWNSTREAM FILES ({len(transitive_dependents)}):
{chr(10).join(transitive_summary) if transitive_summary else "No transitive dependents found."}

SUGGESTED RELEVANT TESTS:
{chr(10).join(tests_summary)}
"""

    prompt = f"""You are a principal software architect performing Evidence-Based Change Impact Analysis.

CRITICAL INSTRUCTIONS:
1. Base your explanation STRICTLY AND ENTIRELY on the provided static dependency evidence above.
2. DO NOT invent or assume dependencies on files not listed in the evidence.
3. Clearly explain WHY and HOW modifying the target could impact the dependent files.
4. Distinguish between direct contract breaks and downstream transitive side effects.

{evidence_text}

Provide your analysis in the following structured JSON format:
{{
  "overall_impact": "High-level summary of blast radius and risk level (Low/Medium/High).",
  "affected_components": [
    {{
      "name": "Component/Module Name",
      "impact_type": "Direct or Transitive",
      "details": "Concrete reason for potential impact."
    }}
  ],
  "potential_breaking_changes": [
    "Specific breaking risk (e.g., interface/type change, return shape, signature mismatch)"
  ],
  "recommended_verification": [
    "Concrete testing or code inspection recommendation"
  ]
}}

Return ONLY valid JSON.
"""

    try:
        raw_response = await gemini_service.generate_content(
            model=settings.CHAT_MODEL,
            contents=prompt
        )
        # Clean markdown code blocks if any
        cleaned = raw_response.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        return json.loads(cleaned.strip())
    except Exception as e:
        logger.warning(f"Failed to generate Gemini impact explanation: {e}")
        return None


async def analyze_change_impact(
    db: AsyncSession,
    repo_id: uuid.UUID,
    user_id: uuid.UUID,
    target_file_path: str,
    symbol_name: Optional[str] = None,
    max_depth: int = 3,
    include_ai_explanation: bool = True
) -> dict:
    """
    Executes Evidence-Based Change Impact Analysis for a repository file or symbol.
    """
    max_depth = max(1, min(max_depth, 5))

    # 1. Authorization: check repository belongs to current user
    repo = (await db.execute(
        select(Repository).where(Repository.id == repo_id, Repository.user_id == user_id)
    )).scalar_one_or_none()

    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found or access denied."
        )

    # 2. Fetch all files for this repository
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

    # 3. Match target file
    matched_target_path = match_target_file(target_file_path, all_repo_paths)
    if not matched_target_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Target file '{target_file_path}' not found in repository."
        )

    target_file = file_map_by_path[matched_target_path]

    # 4. AST Analysis of repository files
    parsed_analysis = analyze_repository_files_ast(files)
    target_analysis = parsed_analysis.get(matched_target_path, {})
    target_exports = target_analysis.get("exports", [])

    # Validate symbol exists if requested
    target_symbols = [e["name"] for e in target_exports]
    is_symbol_exported = False
    if symbol_name:
        is_symbol_exported = any(e["name"] == symbol_name for e in target_exports)

    # 5. Build Dependency Graph (Importers Graph: Target -> List of Importers)
    importers_graph: Dict[str, List[dict]] = {}
    unresolved_list: List[dict] = []

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

                # Find line references for imported symbols in the importer file
                refs_map = {}
                for sym in imported_sym_names:
                    clean_sym = sym.replace("* as ", "")
                    refs = analysis.get("references", {}).get(clean_sym, [])
                    if refs:
                        refs_map[clean_sym] = refs

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
                # If it's a relative specifier that failed to resolve, record as unresolved
                if specifier.startswith("."):
                    unresolved_list.append({
                        "source_file": file_path,
                        "specifier": specifier,
                        "line": imp["line"],
                        "reason": "Relative path could not be resolved to any existing repository file"
                    })

        # Record syntax parser unresolvables
        for unres in analysis.get("unresolved", []):
            unresolved_list.append({
                "source_file": file_path,
                "specifier": "dynamic_import",
                "line": unres.get("line", 1),
                "reason": unres.get("reason", "Dynamic or non-literal import")
            })

    # 6. Direct Dependents Resolution
    direct_candidates = importers_graph.get(matched_target_path, [])
    direct_dependents = []

    for cand in direct_candidates:
        cand_syms = cand["imported_symbols"]
        # If symbol_name is specified, only include files that actually import or reference that symbol
        if symbol_name:
            matches_symbol = (
                symbol_name in cand_syms
                or any(s.startswith("* as") for s in cand_syms)
                or (not cand_syms and cand.get("is_dynamic"))
            )
            if not matches_symbol:
                continue

        direct_dependents.append({
            "path": cand["importer_path"],
            "file_id": cand["file_id"],
            "line_number": cand["line_number"],
            "imported_symbols": cand["imported_symbols"],
            "is_type_only": cand["is_type_only"],
            "is_dynamic": cand["is_dynamic"],
            "references": cand["references"]
        })

    # Sort direct dependents by path
    direct_dependents.sort(key=lambda x: x["path"])
    direct_paths = {d["path"] for d in direct_dependents}

    # 7. Transitive Dependents (BFS Traversal bounded by max_depth)
    transitive_dependents = []
    visited: Set[str] = {matched_target_path}
    visited.update(direct_paths)

    # Queue contains: (current_file_path, dependency_path, current_depth)
    queue: List[Tuple[str, List[str], int]] = [
        (d["path"], [matched_target_path, d["path"]], 1)
        for d in direct_dependents
    ]

    while queue:
        curr_path, path_chain, depth = queue.pop(0)
        if depth >= max_depth:
            continue

        for downstream in importers_graph.get(curr_path, []):
            down_path = downstream["importer_path"]
            if down_path not in visited:
                visited.add(down_path)
                new_chain = path_chain + [down_path]
                transitive_dependents.append({
                    "path": down_path,
                    "file_id": downstream["file_id"],
                    "depth": depth + 1,
                    "dependency_path": new_chain,
                    "via": curr_path,
                    "imported_symbols": downstream["imported_symbols"],
                    "line_number": downstream["line_number"]
                })
                queue.append((down_path, new_chain, depth + 1))

    transitive_dependents.sort(key=lambda x: (x["depth"], x["path"]))

    # 8. Identify Suggested Tests
    suggested_tests_set = set()
    all_affected_paths = direct_paths.union({t["path"] for t in transitive_dependents})
    for p in all_affected_paths:
        if TEST_PATTERN.search(p):
            suggested_tests_set.add(p)

    suggested_tests = sorted(list(suggested_tests_set))

    # 9. AI Grounded Explanation
    ai_explanation = None
    if include_ai_explanation:
        ai_explanation = await generate_impact_explanation(
            target_path=matched_target_path,
            symbol_name=symbol_name,
            direct_dependents=direct_dependents,
            transitive_dependents=transitive_dependents,
            suggested_tests=suggested_tests
        )

    # 10. Compile Limitations
    limitations = [
        "Static analysis is limited to repository-internal files. Third-party package side-effects are not tracked.",
        "Dynamic imports with computed/runtime string expressions cannot be statically resolved.",
        "Suggested tests are identified from downstream dependency paths; tests are NOT automatically executed by this analysis."
    ]
    if symbol_name and not is_symbol_exported:
        limitations.append(
            f"Symbol '{symbol_name}' was not found in top-level static exports of '{matched_target_path}'. Dependents shown import the module."
        )
    if not settings.GEMINI_API_KEY and include_ai_explanation:
        limitations.append("AI explanation was skipped because GEMINI_API_KEY is not configured.")

    return {
        "target": {
            "path": matched_target_path,
            "file_id": str(target_file.id),
            "symbol": symbol_name,
            "language": target_file.language,
            "exported_symbols": target_symbols
        },
        "summary": {
            "direct_count": len(direct_dependents),
            "transitive_count": len(transitive_dependents),
            "total_affected": len(direct_dependents) + len(transitive_dependents),
            "suggested_tests_count": len(suggested_tests),
            "max_depth_reached": max([t["depth"] for t in transitive_dependents], default=1 if direct_dependents else 0)
        },
        "direct_dependents": direct_dependents,
        "transitive_dependents": transitive_dependents,
        "suggested_tests": suggested_tests,
        "unresolved_dependencies": unresolved_list,
        "ai_explanation": ai_explanation,
        "limitations": limitations
    }
