from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class ChangedFileInput(BaseModel):
    path: str
    change_type: Optional[str] = Field("modified", description="modified, added, deleted, or renamed")
    symbols: Optional[List[str]] = Field(default_factory=list, description="Optional explicit symbols changed in this file")


class ChangeSetAnalysisRequest(BaseModel):
    diff_text: Optional[str] = Field(None, description="Unified git diff text")
    changed_files: Optional[List[ChangedFileInput]] = Field(None, description="Explicit list of changed files if diff is not supplied")
    max_depth: Optional[int] = Field(3, ge=1, le=5, description="Maximum traversal depth for downstream dependencies")
    include_ai_explanation: Optional[bool] = Field(True, description="Whether to include grounded Gemini explanation")


class RiskFactor(BaseModel):
    factor: str
    points: int
    reason: str


class RiskPrioritization(BaseModel):
    risk_level: str = Field(..., description="CRITICAL, HIGH, MEDIUM, or LOW")
    score: int = Field(..., description="Deterministic impact risk score (0-100)")
    factors: List[RiskFactor] = Field(default_factory=list)
    explanation: str
    summary_headline: Optional[str] = None


class ChangedFileDetail(BaseModel):
    path: str
    change_type: str = Field(..., description="modified, added, deleted, or renamed")
    changed_symbols: List[str] = Field(default_factory=list)
    modified_lines_count: int = 0
    is_public_api_modified: bool = False
    diff_snippet: Optional[str] = None


class ImpactCause(BaseModel):
    changed_file: str
    changed_symbols: List[str] = Field(default_factory=list)
    relationship: str = Field(..., description="direct or transitive")
    depth: int = 1
    import_line: Optional[int] = None


class MergedDependentFile(BaseModel):
    path: str
    file_id: Optional[str] = None
    relationship: str = Field(..., description="direct or transitive")
    min_depth: int
    caused_by: List[ImpactCause] = Field(default_factory=list)
    imported_symbols: List[str] = Field(default_factory=list)
    import_lines: List[int] = Field(default_factory=list)
    dependency_path: List[str] = Field(default_factory=list)


class SuggestedTest(BaseModel):
    path: str
    reason: str
    status: str = Field("suggested_not_executed", description="Test suggested for execution; not executed automatically")


class ChangeSetSummary(BaseModel):
    changed_files_count: int
    direct_dependents_count: int
    transitive_dependents_count: int
    total_blast_radius: int
    suggested_tests_count: int
    max_depth_reached: int


class ChangeSetAnalysisResponse(BaseModel):
    repository_id: str
    summary: ChangeSetSummary
    risk_prioritization: RiskPrioritization
    changed_files: List[ChangedFileDetail]
    merged_dependents: List[MergedDependentFile]
    suggested_tests: List[SuggestedTest]
    unresolved_dependencies: List[Dict[str, Any]] = Field(default_factory=list)
    ai_explanation: Optional[Dict[str, Any]] = None
    limitations: List[str] = Field(default_factory=list)
