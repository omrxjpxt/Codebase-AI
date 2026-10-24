"use client";

import { useState, useEffect } from "react";
import {
  X,
  Loader2,
  GitFork,
  ArrowRight,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  FileCode,
  Layers,
  Sparkles,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Filter
} from "lucide-react";
import {
  ImpactAnalysisResult,
  analyzeChangeImpact,
  DirectDependent,
  TransitiveDependent
} from "@/lib/api";

interface ImpactAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  repositoryId: string;
  filePath: string;
  initialSymbol?: string;
  onNavigateToFile?: (fileId?: string, filePath?: string, line?: number) => void;
}

export default function ImpactAnalysisModal({
  isOpen,
  onClose,
  repositoryId,
  filePath,
  initialSymbol,
  onNavigateToFile
}: ImpactAnalysisModalProps) {
  const [data, setData] = useState<ImpactAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState<string>(initialSymbol || "");
  const [includeAi, setIncludeAi] = useState(true);
  const [activeTab, setActiveTab] = useState<"direct" | "transitive" | "ai" | "tests" | "limitations">("direct");

  useEffect(() => {
    if (isOpen && repositoryId && filePath) {
      setSelectedSymbol(initialSymbol || "");
      runAnalysis(initialSymbol || "", includeAi);
    } else {
      setData(null);
      setError("");
    }
  }, [isOpen, repositoryId, filePath]);

  const runAnalysis = async (symbolToFilter: string, withAi: boolean) => {
    setIsLoading(true);
    setError("");
    try {
      const res = await analyzeChangeImpact(repositoryId, {
        file_path: filePath,
        symbol_name: symbolToFilter.trim() || undefined,
        max_depth: 3,
        include_ai_explanation: withAi
      });
      setData(res);
      // Automatically switch to AI tab if AI explanation is present and direct is empty, or keep direct
      if (res.direct_dependents.length === 0 && res.ai_explanation) {
        setActiveTab("ai");
      }
    } catch (err: any) {
      setError(err.message || "Failed to analyze change impact.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSymbolChange = (newSymbol: string) => {
    setSelectedSymbol(newSymbol);
    runAnalysis(newSymbol, includeAi);
  };

  if (!isOpen) return null;

  const totalAffected = data?.summary.total_affected ?? 0;
  const directCount = data?.summary.direct_count ?? 0;
  const transitiveCount = data?.summary.transitive_count ?? 0;
  const testsCount = data?.summary.suggested_tests_count ?? 0;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-[var(--background)] border border-[var(--border)] rounded-[14px] w-full max-w-5xl h-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden shadow-black/60">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border)] bg-[var(--surface)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[10px] bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <GitFork size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[16px] font-semibold text-[var(--primary-text)]">
                  Change Impact Analysis
                </h2>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--border)] text-[var(--secondary-text)]">
                  Evidence-Based
                </span>
              </div>
              <p className="text-[12px] text-[var(--secondary-text)] font-mono mt-0.5">
                {filePath}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Symbol Filter */}
            {data?.target?.exported_symbols && data.target.exported_symbols.length > 0 && (
              <div className="flex items-center gap-2">
                <Filter size={14} className="text-[var(--secondary-text)]" />
                <select
                  value={selectedSymbol}
                  onChange={(e) => handleSymbolChange(e.target.value)}
                  className="bg-[var(--background)] border border-[var(--border)] rounded-[8px] px-2.5 py-1 text-[12px] text-[var(--primary-text)] focus:outline-none focus:border-indigo-500"
                >
                  <option value="">All Exported Symbols</option>
                  {data.target.exported_symbols.map((sym) => (
                    <option key={sym} value={sym}>
                      Symbol: {sym}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* AI Toggle */}
            <label className="flex items-center gap-2 text-[12px] text-[var(--secondary-text)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeAi}
                onChange={(e) => {
                  const val = e.target.checked;
                  setIncludeAi(val);
                  runAnalysis(selectedSymbol, val);
                }}
                className="rounded border-[var(--border)] bg-[var(--background)] text-indigo-500 focus:ring-0"
              />
              <Sparkles size={14} className={includeAi ? "text-indigo-400" : "text-[var(--secondary-text)]"} />
              <span className="hidden sm:inline">AI Explanation</span>
            </label>

            {/* Refresh */}
            <button
              onClick={() => runAnalysis(selectedSymbol, includeAi)}
              disabled={isLoading}
              title="Re-run Analysis"
              className="p-1.5 rounded-[8px] text-[var(--secondary-text)] hover:text-[var(--primary-text)] hover:bg-[var(--border)] transition-colors"
            >
              <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-[8px] text-[var(--secondary-text)] hover:text-[var(--primary-text)] hover:bg-[var(--border)] transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Metric Badges */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-3 border-b border-[var(--border)] bg-[var(--background)]/50">
            <div className="p-2.5 rounded-[10px] bg-[var(--surface)] border border-[var(--border)]">
              <span className="text-[11px] text-[var(--secondary-text)] uppercase font-semibold tracking-wider">
                Direct Dependents
              </span>
              <p className="text-[18px] font-bold text-emerald-400 mt-0.5">
                {directCount}
              </p>
            </div>
            <div className="p-2.5 rounded-[10px] bg-[var(--surface)] border border-[var(--border)]">
              <span className="text-[11px] text-[var(--secondary-text)] uppercase font-semibold tracking-wider">
                Transitive Downstream
              </span>
              <p className="text-[18px] font-bold text-indigo-400 mt-0.5">
                {transitiveCount}
              </p>
            </div>
            <div className="p-2.5 rounded-[10px] bg-[var(--surface)] border border-[var(--border)]">
              <span className="text-[11px] text-[var(--secondary-text)] uppercase font-semibold tracking-wider">
                Total Blast Radius
              </span>
              <p className="text-[18px] font-bold text-[var(--primary-text)] mt-0.5">
                {totalAffected} files
              </p>
            </div>
            <div className="p-2.5 rounded-[10px] bg-[var(--surface)] border border-[var(--border)]">
              <span className="text-[11px] text-[var(--secondary-text)] uppercase font-semibold tracking-wider">
                Max Traversal Depth
              </span>
              <p className="text-[18px] font-bold text-amber-400 mt-0.5">
                Level {data.summary.max_depth_reached}
              </p>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        {data && (
          <div className="flex border-b border-[var(--border)] bg-[var(--surface)] px-6 gap-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab("direct")}
              className={`py-3 px-3 text-[13px] font-medium border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
                activeTab === "direct"
                  ? "border-emerald-500 text-emerald-400"
                  : "border-transparent text-[var(--secondary-text)] hover:text-[var(--primary-text)]"
              }`}
            >
              <FileCode size={15} />
              Direct Dependents ({directCount})
            </button>

            <button
              onClick={() => setActiveTab("transitive")}
              className={`py-3 px-3 text-[13px] font-medium border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
                activeTab === "transitive"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-[var(--secondary-text)] hover:text-[var(--primary-text)]"
              }`}
            >
              <Layers size={15} />
              Transitive Downstream ({transitiveCount})
            </button>

            {data.ai_explanation && (
              <button
                onClick={() => setActiveTab("ai")}
                className={`py-3 px-3 text-[13px] font-medium border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
                  activeTab === "ai"
                    ? "border-purple-500 text-purple-400"
                    : "border-transparent text-[var(--secondary-text)] hover:text-[var(--primary-text)]"
                }`}
              >
                <Sparkles size={15} />
                AI Impact Explanation
              </button>
            )}

            {testsCount > 0 && (
              <button
                onClick={() => setActiveTab("tests")}
                className={`py-3 px-3 text-[13px] font-medium border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
                  activeTab === "tests"
                    ? "border-amber-500 text-amber-400"
                    : "border-transparent text-[var(--secondary-text)] hover:text-[var(--primary-text)]"
                }`}
              >
                <CheckCircle2 size={15} />
                Suggested Tests ({testsCount})
              </button>
            )}

            <button
              onClick={() => setActiveTab("limitations")}
              className={`py-3 px-3 text-[13px] font-medium border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
                activeTab === "limitations"
                  ? "border-neutral-400 text-[var(--primary-text)]"
                  : "border-transparent text-[var(--secondary-text)] hover:text-[var(--primary-text)]"
              }`}
            >
              <AlertTriangle size={15} />
              Analysis Boundaries ({data.limitations.length})
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 relative">
          {isLoading && (
            <div className="absolute inset-0 bg-[var(--background)]/80 backdrop-blur-sm flex flex-col items-center justify-center z-20">
              <Loader2 className="animate-spin text-indigo-400 mb-3" size={36} />
              <p className="text-[14px] font-medium text-[var(--primary-text)]">
                Analyzing AST dependencies across repository...
              </p>
              {includeAi && (
                <p className="text-[12px] text-[var(--secondary-text)] mt-1">
                  Synthesizing grounded explanation with Gemini-3.8-Flash
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="p-6 text-center max-w-lg mx-auto">
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-3 text-red-400">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-[15px] font-semibold text-red-400 mb-1">
                Analysis Failed
              </h3>
              <p className="text-[13px] text-[var(--secondary-text)]">{error}</p>
            </div>
          )}

          {/* TAB 1: DIRECT DEPENDENTS */}
          {data && activeTab === "direct" && (
            <div>
              {data.direct_dependents.length === 0 ? (
                <div className="text-center py-12 max-w-md mx-auto">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-3 text-emerald-400">
                    <CheckCircle2 size={24} />
                  </div>
                  <h3 className="text-[15px] font-semibold text-[var(--primary-text)] mb-1">
                    No Direct Dependents Found
                  </h3>
                  <p className="text-[13px] text-[var(--secondary-text)]">
                    {selectedSymbol
                      ? `No repository files directly import or reference symbol '${selectedSymbol}'.`
                      : "No other files in this repository statically import this file."}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[12px] text-[var(--secondary-text)] mb-4">
                    Files that contain explicit static import declarations pointing directly to <code className="text-indigo-400 font-mono bg-indigo-500/10 px-1 py-0.5 rounded">{data.target.path}</code>:
                  </p>
                  {data.direct_dependents.map((dep, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-[10px] bg-[var(--surface)] border border-[var(--border)] hover:border-indigo-500/40 transition-colors flex flex-col gap-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <FileCode size={16} className="text-emerald-400 shrink-0" />
                          <span className="text-[14px] font-medium font-mono text-[var(--primary-text)]">
                            {dep.path}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[var(--border)] text-[var(--secondary-text)]">
                            Line {dep.line_number}
                          </span>
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Direct Import
                          </span>
                          {onNavigateToFile && (
                            <button
                              onClick={() => onNavigateToFile(dep.file_id, dep.path, dep.line_number)}
                              className="text-[12px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium ml-2"
                            >
                              View <ExternalLink size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Imported Symbols */}
                      {dep.imported_symbols.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] text-[var(--secondary-text)]">Imported:</span>
                          {dep.imported_symbols.map((sym, sIdx) => (
                            <span
                              key={sIdx}
                              className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                                selectedSymbol && (sym === selectedSymbol || sym.includes(selectedSymbol))
                                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold"
                                  : "bg-[var(--border)] text-[var(--primary-text)]"
                              }`}
                            >
                              {sym}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Code References */}
                      {Object.keys(dep.references).length > 0 && (
                        <div className="text-[11px] text-[var(--secondary-text)] flex items-center gap-2 flex-wrap">
                          <span>Referenced in code:</span>
                          {Object.entries(dep.references).map(([sym, lines]) => (
                            <span key={sym} className="font-mono text-[10px] text-[var(--secondary-text)] bg-[var(--background)] px-1.5 py-0.5 rounded">
                              {sym} @ lines [{lines.slice(0, 6).join(", ")}{lines.length > 6 ? "..." : ""}]
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TRANSITIVE DEPENDENTS */}
          {data && activeTab === "transitive" && (
            <div>
              {data.transitive_dependents.length === 0 ? (
                <div className="text-center py-12 max-w-md mx-auto">
                  <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-3 text-indigo-400">
                    <Layers size={24} />
                  </div>
                  <h3 className="text-[15px] font-semibold text-[var(--primary-text)] mb-1">
                    No Transitive Dependents
                  </h3>
                  <p className="text-[13px] text-[var(--secondary-text)]">
                    Direct dependents do not have further downstream importers within the maximum traversal depth.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[12px] text-[var(--secondary-text)] mb-4">
                    Files affected transitively through intermediate modules:
                  </p>
                  {data.transitive_dependents.map((dep, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-[10px] bg-[var(--surface)] border border-[var(--border)] hover:border-indigo-500/40 transition-colors flex flex-col gap-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Layers size={16} className="text-indigo-400 shrink-0" />
                          <span className="text-[14px] font-medium font-mono text-[var(--primary-text)]">
                            {dep.path}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            Depth {dep.depth}
                          </span>
                          {onNavigateToFile && (
                            <button
                              onClick={() => onNavigateToFile(dep.file_id, dep.path, dep.line_number)}
                              className="text-[12px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium ml-2"
                            >
                              View <ExternalLink size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Dependency Path Chain */}
                      <div className="bg-[var(--background)] px-3 py-2 rounded-[8px] flex items-center gap-1.5 flex-wrap text-[11px] font-mono text-[var(--secondary-text)]">
                        <span className="text-[10px] uppercase font-semibold text-neutral-400 mr-1">Chain:</span>
                        {dep.dependency_path.map((segment, sIdx) => (
                          <div key={sIdx} className="flex items-center gap-1">
                            <span className={sIdx === dep.dependency_path.length - 1 ? "text-indigo-300 font-bold" : ""}>
                              {segment.split("/").pop()}
                            </span>
                            {sIdx < dep.dependency_path.length - 1 && (
                              <ChevronRight size={12} className="text-neutral-500" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AI GROUNDED EXPLANATION */}
          {data && activeTab === "ai" && data.ai_explanation && (
            <div className="space-y-5 max-w-4xl">
              {/* Overall Impact Card */}
              <div className="p-4 rounded-[12px] bg-gradient-to-br from-indigo-950/30 to-purple-950/20 border border-indigo-500/20">
                <div className="flex items-center gap-2 mb-2 text-indigo-400">
                  <Sparkles size={16} />
                  <h4 className="text-[14px] font-semibold">Executive Impact Summary</h4>
                </div>
                <p className="text-[13px] text-[var(--primary-text)] leading-relaxed">
                  {data.ai_explanation.overall_impact}
                </p>
              </div>

              {/* Potential Breaking Changes */}
              {data.ai_explanation.potential_breaking_changes && data.ai_explanation.potential_breaking_changes.length > 0 && (
                <div className="p-4 rounded-[12px] bg-[var(--surface)] border border-[var(--border)]">
                  <div className="flex items-center gap-2 mb-3 text-amber-400">
                    <AlertTriangle size={16} />
                    <h4 className="text-[14px] font-semibold">Potential Breaking Changes</h4>
                  </div>
                  <ul className="space-y-2">
                    {data.ai_explanation.potential_breaking_changes.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 text-[13px] text-[var(--primary-text)]">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Affected Components Breakdown */}
              {data.ai_explanation.affected_components && data.ai_explanation.affected_components.length > 0 && (
                <div className="p-4 rounded-[12px] bg-[var(--surface)] border border-[var(--border)]">
                  <div className="flex items-center gap-2 mb-3 text-indigo-400">
                    <Layers size={16} />
                    <h4 className="text-[14px] font-semibold">Affected Modules & Components</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {data.ai_explanation.affected_components.map((comp, idx) => (
                      <div key={idx} className="p-3 rounded-[8px] bg-[var(--background)] border border-[var(--border)]">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[12px] font-mono font-medium text-[var(--primary-text)]">
                            {comp.name}
                          </span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400">
                            {comp.impact_type}
                          </span>
                        </div>
                        <p className="text-[12px] text-[var(--secondary-text)] leading-normal">
                          {comp.details}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommended Verification */}
              {data.ai_explanation.recommended_verification && data.ai_explanation.recommended_verification.length > 0 && (
                <div className="p-4 rounded-[12px] bg-[var(--surface)] border border-[var(--border)]">
                  <div className="flex items-center gap-2 mb-3 text-emerald-400">
                    <CheckCircle2 size={16} />
                    <h4 className="text-[14px] font-semibold">Recommended Verification Steps</h4>
                  </div>
                  <ul className="space-y-2">
                    {data.ai_explanation.recommended_verification.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 text-[13px] text-[var(--primary-text)]">
                        <CheckCircle2 size={14} className="text-emerald-400 mt-1 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-[11px] text-[var(--secondary-text)] italic pt-1">
                * Note: AI explanation is strictly grounded on the static dependency graph discovered by the AST engine.
              </p>
            </div>
          )}

          {/* TAB 4: SUGGESTED TESTS */}
          {data && activeTab === "tests" && (
            <div className="space-y-4">
              <div className="p-4 rounded-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[13px]">
                <strong>Suggested Tests Notice:</strong> The following test suites import modules directly or transitively in the blast radius. These tests are recommended for execution but have <em>not</em> been run automatically.
              </div>
              <div className="space-y-2">
                {data.suggested_tests.map((testPath, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-[8px] bg-[var(--surface)] border border-[var(--border)] flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={15} className="text-amber-400" />
                      <span className="text-[13px] font-mono text-[var(--primary-text)]">
                        {testPath}
                      </span>
                    </div>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      Suggested (Not Executed)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: BOUNDARIES & LIMITATIONS */}
          {data && activeTab === "limitations" && (
            <div className="space-y-4 max-w-3xl">
              <div className="p-4 rounded-[10px] bg-[var(--surface)] border border-[var(--border)]">
                <h4 className="text-[14px] font-semibold text-[var(--primary-text)] mb-3">
                  Static Analysis Boundaries & Guarantees
                </h4>
                <ul className="space-y-2.5 text-[13px] text-[var(--secondary-text)]">
                  {data.limitations.map((lim, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 mt-2 shrink-0" />
                      <span>{lim}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {data.unresolved_dependencies.length > 0 && (
                <div className="p-4 rounded-[10px] bg-[var(--surface)] border border-[var(--border)]">
                  <h4 className="text-[14px] font-semibold text-neutral-300 mb-2">
                    Unresolved Specifiers ({data.unresolved_dependencies.length})
                  </h4>
                  <div className="space-y-2">
                    {data.unresolved_dependencies.map((u, idx) => (
                      <div key={idx} className="text-[12px] font-mono text-[var(--secondary-text)] bg-[var(--background)] p-2 rounded border border-[var(--border)]">
                        <span>{u.source_file}:{u.line} &rarr; <code>{u.specifier}</code> ({u.reason})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[var(--border)] bg-[var(--surface)] flex items-center justify-between text-[12px] text-[var(--secondary-text)]">
          <div>
            Target: <code className="text-[var(--primary-text)] font-mono">{data?.target.path || filePath}</code>
            {selectedSymbol && (
              <span className="ml-2 px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-mono text-[11px]">
                symbol: {selectedSymbol}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-[8px] bg-[var(--border)] text-[var(--primary-text)] hover:bg-[var(--border)]/80 font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
