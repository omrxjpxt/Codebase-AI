from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class ImpactAnalysisRequest(BaseModel):
    file_path: str = Field(..., description="Path to the target repository file to analyze")
    symbol_name: Optional[str] = Field(None, description="Optional exported symbol (function, class, interface, type)")
    max_depth: Optional[int] = Field(3, ge=1, le=5, description="Maximum traversal depth for downstream dependencies")
    include_ai_explanation: Optional[bool] = Field(True, description="Whether to include grounded Gemini explanation")


class DirectDependent(BaseModel):
    path: str
    file_id: Optional[str] = None
    line_number: int
    imported_symbols: List[str]
    is_type_only: bool = False
    is_dynamic: bool = False
    references: Dict[str, List[int]] = {}


class TransitiveDependent(BaseModel):
    path: str
    file_id: Optional[str] = None
    depth: int
    dependency_path: List[str]
    via: str
    imported_symbols: List[str] = []
    line_number: Optional[int] = None


class ImpactTarget(BaseModel):
    path: str
    file_id: str
    symbol: Optional[str] = None
    language: str
    exported_symbols: List[str] = []


class ImpactSummary(BaseModel):
    direct_count: int
    transitive_count: int
    total_affected: int
    suggested_tests_count: int
    max_depth_reached: int


class UnresolvedDependency(BaseModel):
    source_file: str
    specifier: str
    line: int
    reason: str


class ImpactAnalysisResponse(BaseModel):
    target: ImpactTarget
    summary: ImpactSummary
    direct_dependents: List[DirectDependent]
    transitive_dependents: List[TransitiveDependent]
    suggested_tests: List[str]
    unresolved_dependencies: List[UnresolvedDependency]
    ai_explanation: Optional[Dict[str, Any]] = None
    limitations: List[str]
