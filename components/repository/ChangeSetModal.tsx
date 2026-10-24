"use client";

import { useState } from "react";
import {
  X,
  Loader2,
  GitPullRequest,
  ArrowRight,
  AlertTriangle,
  FileCode,
  Layers,
  Sparkles,
  ExternalLink,
  ChevronRight,
  PlusCircle,
  Trash2,
  ShieldAlert,
  TestTube2,
  HelpCircle,
  FileDiff,
  Flame,
  Info
} from "lucide-react";
import {
  ChangeSetAnalysisResponse,
  analyzeChangeSetImpact,
  MergedDependentFile
} from "@/lib/api";

interface ChangeSetModalProps {
  isOpen: boolean;
  onClose: () => void;
  repositoryId: string;
  onNavigateToFile?: (fileId?: string, filePath?: string, line?: number) => void;
}

const SAMPLE_DIFF_SAMAY = `diff --git a/samay-main/src/utils/api/server.ts b/samay-main/src/utils/api/server.ts
--- a/samay-main/src/utils/api/server.ts
+++ b/samay-main/src/utils/api/server.ts
@@ -52,6 +52,8 @@ export const deletePoll = async (
   id: string,
   secret: string
 ): Promise<HttpResponse> => {
+  // Added telemetry logging for poll deletion
+  console.log("Audit log: delete poll invoked", id);
   return postData(\`/api/poll/\${id}/delete\`, { secret });
 };
`;

const SAMPLE_DIFF_MULTI = `diff --git a/samay-main/src/models/poll.ts b/samay-main/src/models/poll.ts
--- a/samay-main/src/models/poll.ts
+++ b/samay-main/src/models/poll.ts
@@ -10,4 +10,6 @@ export interface Poll {
   title: string;
   description?: string;
+  is_archived?: boolean;
+  max_votes?: number;
 }
diff --git a/samay-main/src/utils/api/server.ts b/samay-main/src/utils/api/server.ts
--- a/samay-main/src/utils/api/server.ts
+++ b/samay-main/src/utils/api/server.ts
@@ -40,3 +40,5 @@ export const fetchPoll = async (id: string): Promise<Poll> => {
   return getData(\`/api/poll/\${id}\`);
 };
`;

export default function ChangeSetModal({
  isOpen,
  onClose,
  repositoryId,
  onNavigateToFile
}: ChangeSetModalProps) {
  const [inputMode, setInputMode] = useState<"diff" | "manual">("diff");
  const [diffText, setDiffText] = useState("");
  const [manualFiles, setManualFiles] = useState<Array<{ path: string; changeType: string; symbols: string }>>([
    { path: "", changeType: "modified", symbols: "" }
  ]);
  const [maxDepth, setMaxDepth] = useState<number>(3);
  const [includeAi, setIncludeAi] = useState<boolean>(true);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<ChangeSetAnalysisResponse | null>(null);
  const [activeTab, setActiveTab] = useState<"blast_radius" | "changed_files" | "ai" | "tests" | "limitations">("blast_radius");

  if (!isOpen) return null;

  const handleAddManualRow = () => {
    setManualFiles(prev => [...prev, { path: "", changeType: "modified", symbols: "" }]);
  };

  const handleRemoveManualRow = (index: number) => {
    setManualFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleManualRowChange = (index: number, field: "path" | "changeType" | "symbols", value: string) => {
    setManualFiles(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const runAnalysis = async () => {
    setIsLoading(true);
    setError("");
    setData(null);

    try {
      let payload: any = {
        max_depth: maxDepth,
        include_ai_explanation: includeAi
      };

      if (inputMode === "diff") {
        if (!diffText.trim()) {
          setError("Please paste a unified git diff or click a sample diff below.");
          setIsLoading(false);
          return;
        }
        payload.diff_text = diffText.trim();
      } else {
        const validFiles = manualFiles
          .map(f => ({
            path: f.path.trim(),
            change_type: f.changeType,
            symbols: f.symbols.split(",").map(s => s.trim()).filter(Boolean)
          }))
          .filter(f => f.path.length > 0);

        if (validFiles.length === 0) {
          setError("Please specify at least one changed file path.");
          setIsLoading(false);
          return;
        }
        payload.changed_files = validFiles;
      }

      const res = await analyzeChangeSetImpact(repositoryId, payload);
      setData(res);
      setActiveTab("blast_radius");
    } catch (err: any) {
      setError(err.message || "Failed to analyze change set blast radius.");
    } finally {
      setIsLoading(false);
    }
  };

  const getRiskBadge = (level: string) => {
    switch (level) {
      case "CRITICAL":
        return "bg-rose-500/15 text-rose-400 border-rose-500/30";
      case "HIGH":
        return "bg-amber-500/15 text-amber-400 border-amber-500/30";
      case "MEDIUM":
        return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
      default:
        return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    }
  };

  const getChangeTypeBadge = (changeType: string) => {
    switch (changeType.toLowerCase()) {
      case "added":
        return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
      case "deleted":
        return "bg-rose-500/15 text-rose-400 border-rose-500/30";
      case "renamed":
        return "bg-blue-500/15 text-blue-400 border-blue-500/30";
      default:
        return "bg-indigo-500/15 text-indigo-400 border-indigo-500/30";
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-[var(--background)] border border-[var(--border)] rounded-[14px] w-full max-w-6xl h-full max-h-[94vh] flex flex-col shadow-2xl overflow-hidden shadow-black/70">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border)] bg-[var(--surface)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[10px] bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Flame size={20} className="text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[17px] font-semibold text-[var(--primary-text)]">
                  Git Diff Blast Radius Analysis
                </h2>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
                  Static Graph + AI
                </span>
              </div>
              <p className="text-[12px] text-[var(--secondary-text)] mt-0.5">
                Analyze proposed changes, merge multi-file dependent trees, classify risk, and recommend verification.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Max Depth */}
            <div className="flex items-center gap-1.5 text-[12px] text-[var(--secondary-text)]">
              <span>Depth:</span>
              <select
                value={maxDepth}
                onChange={(e) => setMaxDepth(Number(e.target.value))}
                className="bg-[var(--background)] border border-[var(--border)] rounded-[6px] px-2 py-1 text-[12px] text-[var(--primary-text)] focus:outline-none"
              >
                <option value={1}>1 hop (Direct only)</option>
                <option value={2}>2 hops</option>
                <option value={3}>3 hops (Recommended)</option>
                <option value={4}>4 hops</option>
                <option value={5}>5 hops (Deep)</option>
              </select>
            </div>

            {/* AI Toggle */}
            <label className="flex items-center gap-2 text-[12px] text-[var(--secondary-text)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeAi}
                onChange={(e) => setIncludeAi(e.target.checked)}
                className="rounded border-[var(--border)] bg-[var(--background)] text-indigo-500 focus:ring-0"
              />
              <span className="flex items-center gap-1">
                <Sparkles size={13} className="text-amber-400" />
                Gemini Explanation
              </span>
            </label>

            <button
              onClick={onClose}
              className="p-1.5 rounded-[8px] text-[var(--secondary-text)] hover:text-[var(--primary-text)] hover:bg-[var(--surface-hover)] transition-all ml-1"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body: Split view (Input on left/top when no data, results view once run) */}
        {!data && !isLoading ? (
          <div className="flex-1 overflow-y-auto p-6 flex flex-col max-w-4xl mx-auto w-full">
            {/* Input Mode Selector */}
            <div className="flex items-center gap-2 mb-4 p-1 bg-[var(--surface)] border border-[var(--border)] rounded-[10px] w-fit">
              <button
                onClick={() => setInputMode("diff")}
                className={`px-3 py-1.5 text-[12px] font-medium rounded-[8px] transition-all flex items-center gap-1.5 ${
                  inputMode === "diff"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-[var(--secondary-text)] hover:text-[var(--primary-text)]"
                }`}
              >
                <FileDiff size={14} />
                Paste Unified Diff
              </button>
              <button
                onClick={() => setInputMode("manual")}
                className={`px-3 py-1.5 text-[12px] font-medium rounded-[8px] transition-all flex items-center gap-1.5 ${
                  inputMode === "manual"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-[var(--secondary-text)] hover:text-[var(--primary-text)]"
                }`}
              >
                <FileCode size={14} />
                Select Changed Files
              </button>
            </div>

            {inputMode === "diff" ? (
              <div className="flex flex-col flex-1">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[13px] font-medium text-[var(--primary-text)]">
                    Unified Diff Payload
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[var(--secondary-text)]">Quick presets:</span>
                    <button
                      onClick={() => setDiffText(SAMPLE_DIFF_SAMAY)}
                      className="text-[11px] px-2 py-0.5 rounded border border-[var(--border)] text-indigo-400 hover:bg-[var(--surface)] transition-all"
                    >
                      Samay API Diff
                    </button>
                    <button
                      onClick={() => setDiffText(SAMPLE_DIFF_MULTI)}
                      className="text-[11px] px-2 py-0.5 rounded border border-[var(--border)] text-indigo-400 hover:bg-[var(--surface)] transition-all"
                    >
                      Multi-file Model Diff
                    </button>
                  </div>
                </div>
                <textarea
                  value={diffText}
                  onChange={(e) => setDiffText(e.target.value)}
                  placeholder={`diff --git a/src/api.ts b/src/api.ts\n--- a/src/api.ts\n+++ b/src/api.ts\n@@ -10,3 +10,4 @@ export function fetchUser() {\n+  console.log("fetching");\n }`}
                  rows={14}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-[10px] p-3 text-[12px] font-mono text-[var(--primary-text)] focus:outline-none focus:border-indigo-500 resize-none"
                />
                <p className="text-[11px] text-[var(--secondary-text)] mt-2">
                  Supports standard git diff formats. Detects modified, added, deleted, and renamed files, correlating line ranges with TypeScript/Python AST exports. Max payload: 500 KB.
                </p>
              </div>
            ) : (
              <div className="flex flex-col flex-1">
                <label className="text-[13px] font-medium text-[var(--primary-text)] mb-2">
                  Changed Files &amp; Symbols
                </label>
                <div className="space-y-2 mb-3">
                  {manualFiles.map((row, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={row.path}
                        onChange={(e) => handleManualRowChange(idx, "path", e.target.value)}
                        placeholder="e.g. src/utils/api/server.ts"
                        className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-[8px] px-3 py-1.5 text-[12px] font-mono text-[var(--primary-text)] focus:outline-none focus:border-indigo-500"
                      />
                      <select
                        value={row.changeType}
                        onChange={(e) => handleManualRowChange(idx, "changeType", e.target.value)}
                        className="bg-[var(--surface)] border border-[var(--border)] rounded-[8px] px-2.5 py-1.5 text-[12px] text-[var(--primary-text)] focus:outline-none"
                      >
                        <option value="modified">Modified</option>
                        <option value="added">Added</option>
                        <option value="deleted">Deleted</option>
                        <option value="renamed">Renamed</option>
                      </select>
                      <input
                        type="text"
                        value={row.symbols}
                        onChange={(e) => handleManualRowChange(idx, "symbols", e.target.value)}
                        placeholder="Optional symbols (e.g. deletePoll, fetchPoll)"
                        className="w-64 bg-[var(--surface)] border border-[var(--border)] rounded-[8px] px-3 py-1.5 text-[12px] font-mono text-[var(--primary-text)] focus:outline-none focus:border-indigo-500"
                      />
                      {manualFiles.length > 1 && (
                        <button
                          onClick={() => handleRemoveManualRow(idx)}
                          className="p-1.5 text-[var(--secondary-text)] hover:text-rose-400 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleAddManualRow}
                  className="flex items-center gap-1.5 text-[12px] text-indigo-400 hover:text-indigo-300 w-fit transition-colors mb-4"
                >
                  <PlusCircle size={14} />
                  Add another file
                </button>
              </div>
            )}

            {error && (
              <div className="p-3 mb-4 rounded-[8px] bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[12px] flex items-center gap-2">
                <AlertTriangle size={15} className="flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-[var(--border)]">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-[8px] border border-[var(--border)] text-[var(--secondary-text)] text-[13px] hover:bg-[var(--surface)] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={runAnalysis}
                className="px-5 py-2 rounded-[8px] bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-medium shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2"
              >
                <Flame size={15} />
                Analyze Blast Radius
              </button>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <Loader2 size={36} className="text-indigo-400 animate-spin mb-4" />
            <h3 className="text-[16px] font-semibold text-[var(--primary-text)] mb-1">
              Analyzing Change Set Blast Radius
            </h3>
            <p className="text-[13px] text-[var(--secondary-text)] max-w-md">
              Parsing AST trees, resolving imports, merging transitive dependents, computing deterministic risk, and requesting Gemini grounded explanation...
            </p>
          </div>
        ) : data ? (
          /* Results View */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Risk Prioritization & Summary Banner */}
            <div className="px-6 py-4 bg-[var(--surface)] border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={`px-3 py-1.5 rounded-[10px] border font-bold text-[14px] flex items-center gap-2 ${getRiskBadge(data.risk_prioritization.risk_level)}`}>
                  <ShieldAlert size={18} />
                  <span>{data.risk_prioritization.risk_level} RISK</span>
                  <span className="text-[12px] font-mono opacity-80">({data.risk_prioritization.score}/100)</span>
                </div>
                <div>
                  <h4 className="text-[14px] font-semibold text-[var(--primary-text)]">
                    {data.risk_prioritization.summary_headline}
                  </h4>
                  <p className="text-[12px] text-[var(--secondary-text)]">
                    {data.summary.total_blast_radius} affected files ({data.summary.direct_dependents_count} direct, {data.summary.transitive_dependents_count} transitive) across {data.summary.changed_files_count} changed files.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setData(null)}
                  className="px-3 py-1.5 rounded-[8px] border border-[var(--border)] text-[var(--secondary-text)] text-[12px] hover:text-[var(--primary-text)] hover:bg-[var(--surface-hover)] transition-all"
                >
                  Edit Changes
                </button>
              </div>
            </div>

            {/* Score Factors Breakdown Bar */}
            {data.risk_prioritization.factors.length > 0 && (
              <div className="px-6 py-2.5 bg-black/20 border-b border-[var(--border)] flex items-center gap-2 overflow-x-auto text-[11px]">
                <span className="text-[var(--secondary-text)] flex-shrink-0 font-medium">Risk Factors:</span>
                {data.risk_prioritization.factors.map((f, i) => (
                  <span
                    key={i}
                    title={f.reason}
                    className="flex-shrink-0 px-2 py-0.5 rounded-[6px] bg-[var(--surface)] border border-[var(--border)] text-[var(--primary-text)] flex items-center gap-1"
                  >
                    <span className="font-semibold text-indigo-400">+{f.points}</span>
                    <span>{f.factor}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Sub-tabs */}
            <div className="flex items-center gap-1 px-6 border-b border-[var(--border)] bg-[var(--surface)]/50">
              <button
                onClick={() => setActiveTab("blast_radius")}
                className={`py-3 px-3 text-[13px] font-medium border-b-2 transition-all flex items-center gap-2 ${
                  activeTab === "blast_radius"
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-[var(--secondary-text)] hover:text-[var(--primary-text)]"
                }`}
              >
                <Layers size={14} />
                Merged Blast Radius
                <span className="px-1.5 py-0.2 rounded-full bg-[var(--border)] text-[10px]">
                  {data.summary.total_blast_radius}
                </span>
              </button>

              <button
                onClick={() => setActiveTab("changed_files")}
                className={`py-3 px-3 text-[13px] font-medium border-b-2 transition-all flex items-center gap-2 ${
                  activeTab === "changed_files"
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-[var(--secondary-text)] hover:text-[var(--primary-text)]"
                }`}
              >
                <FileCode size={14} />
                Changed Files
                <span className="px-1.5 py-0.2 rounded-full bg-[var(--border)] text-[10px]">
                  {data.summary.changed_files_count}
                </span>
              </button>

              {data.ai_explanation && (
                <button
                  onClick={() => setActiveTab("ai")}
                  className={`py-3 px-3 text-[13px] font-medium border-b-2 transition-all flex items-center gap-2 ${
                    activeTab === "ai"
                      ? "border-indigo-500 text-indigo-400"
                      : "border-transparent text-[var(--secondary-text)] hover:text-[var(--primary-text)]"
                  }`}
                >
                  <Sparkles size={14} className="text-amber-400" />
                  AI Explanation
                </button>
              )}

              <button
                onClick={() => setActiveTab("tests")}
                className={`py-3 px-3 text-[13px] font-medium border-b-2 transition-all flex items-center gap-2 ${
                  activeTab === "tests"
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-[var(--secondary-text)] hover:text-[var(--primary-text)]"
                }`}
              >
                <TestTube2 size={14} />
                Suggested Tests
                <span className="px-1.5 py-0.2 rounded-full bg-[var(--border)] text-[10px]">
                  {data.suggested_tests.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab("limitations")}
                className={`py-3 px-3 text-[13px] font-medium border-b-2 transition-all flex items-center gap-2 ${
                  activeTab === "limitations"
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-[var(--secondary-text)] hover:text-[var(--primary-text)]"
                }`}
              >
                <HelpCircle size={14} />
                Analysis Scope &amp; Gaps
                {data.unresolved_dependencies.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 text-[10px]">
                    {data.unresolved_dependencies.length}
                  </span>
                )}
              </button>
            </div>

            {/* Tab Panels */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* TAB 1: Merged Blast Radius */}
              {activeTab === "blast_radius" && (
                <div>
                  {data.merged_dependents.length === 0 ? (
                    <div className="text-center py-16 text-[var(--secondary-text)]">
                      <Layers size={36} className="mx-auto mb-3 opacity-40" />
                      <p className="text-[14px] font-semibold text-[var(--primary-text)]">
                        No downstream dependents statically detected
                      </p>
                      <p className="text-[12px] max-w-md mx-auto mt-1">
                        The static dependency graph found no imports of these files. Note: dynamic imports, reflection, or runtime events may still exist.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {data.merged_dependents.map((dep: MergedDependentFile, idx: number) => (
                        <div
                          key={idx}
                          className="p-4 rounded-[10px] bg-[var(--surface)] border border-[var(--border)] hover:border-indigo-500/40 transition-all flex flex-col gap-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                dep.relationship === "direct"
                                  ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/25"
                                  : "bg-purple-500/15 text-purple-400 border border-purple-500/25"
                              }`}>
                                {dep.relationship} (Hop {dep.min_depth})
                              </span>
                              <span className="font-mono text-[13px] font-medium text-[var(--primary-text)]">
                                {dep.path}
                              </span>
                            </div>

                            <button
                              onClick={() => onNavigateToFile?.(dep.file_id, dep.path, dep.import_lines[0])}
                              className="px-2.5 py-1 rounded-[6px] border border-[var(--border)] text-[11px] text-indigo-400 hover:bg-[var(--surface-hover)] transition-all flex items-center gap-1"
                            >
                              <ExternalLink size={12} />
                              View Source
                            </button>
                          </div>

                          {/* Causality Linkage */}
                          <div className="bg-black/25 rounded-[8px] p-2.5 border border-[var(--border)]/60 text-[12px]">
                            <div className="text-[11px] font-medium text-[var(--secondary-text)] mb-1.5 flex items-center gap-1">
                              <Info size={12} />
                              Impacted because of:
                            </div>
                            <div className="space-y-1.5">
                              {dep.caused_by.map((cause, cIdx) => (
                                <div key={cIdx} className="flex flex-wrap items-center gap-2 text-[11px]">
                                  <span className="font-mono text-indigo-300">
                                    {cause.changed_file}
                                  </span>
                                  <ArrowRight size={11} className="text-[var(--secondary-text)]" />
                                  <span className="text-[var(--secondary-text)]">
                                    {cause.relationship} dependency (depth {cause.depth}, line {cause.import_line})
                                  </span>
                                  {cause.changed_symbols && cause.changed_symbols.length > 0 && (
                                    <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-mono text-[10px]">
                                      symbols: {cause.changed_symbols.join(", ")}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Dependency Path Chain */}
                          {dep.dependency_path && dep.dependency_path.length > 1 && (
                            <div className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--secondary-text)] overflow-x-auto">
                              <span className="font-sans font-medium text-[var(--secondary-text)]">Path:</span>
                              {dep.dependency_path.map((node, nIdx) => (
                                <span key={nIdx} className="flex items-center gap-1">
                                  <span className={nIdx === dep.dependency_path.length - 1 ? "text-[var(--primary-text)] font-semibold" : ""}>
                                    {node.split("/").pop()}
                                  </span>
                                  {nIdx < dep.dependency_path.length - 1 && (
                                    <ChevronRight size={12} className="text-[var(--secondary-text)]" />
                                  )}
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

              {/* TAB 2: Changed Files */}
              {activeTab === "changed_files" && (
                <div className="space-y-3">
                  {data.changed_files.map((cf, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-[10px] bg-[var(--surface)] border border-[var(--border)] flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${getChangeTypeBadge(cf.change_type)}`}>
                            {cf.change_type}
                          </span>
                          <span className="font-mono text-[13px] font-medium text-[var(--primary-text)]">
                            {cf.path}
                          </span>
                        </div>
                        {cf.is_public_api_modified && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            Public API / Contract Modified
                          </span>
                        )}
                      </div>

                      {cf.changed_symbols && cf.changed_symbols.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[11px] text-[var(--secondary-text)]">Changed Symbols:</span>
                          <div className="flex flex-wrap gap-1">
                            {cf.changed_symbols.map((sym, sIdx) => (
                              <span key={sIdx} className="px-2 py-0.5 rounded bg-[var(--background)] border border-[var(--border)] font-mono text-[11px] text-indigo-300">
                                {sym}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {cf.diff_snippet && (
                        <div className="mt-2 bg-black/40 rounded-[8px] p-3 border border-[var(--border)] font-mono text-[11px] overflow-x-auto text-[var(--primary-text)]">
                          <pre>{cf.diff_snippet}</pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 3: Grounded AI Explanation */}
              {activeTab === "ai" && data.ai_explanation && (
                <div className="space-y-6 max-w-4xl">
                  {/* Summary */}
                  <div className="p-4 rounded-[10px] bg-indigo-500/10 border border-indigo-500/25">
                    <h4 className="text-[14px] font-semibold text-indigo-300 mb-2 flex items-center gap-2">
                      <Sparkles size={16} />
                      Grounded Change Impact Assessment
                    </h4>
                    <p className="text-[13px] text-[var(--primary-text)] leading-relaxed">
                      {data.ai_explanation.summary}
                    </p>
                  </div>

                  {/* Breaking Risks */}
                  {data.ai_explanation.breaking_risks && data.ai_explanation.breaking_risks.length > 0 && (
                    <div>
                      <h4 className="text-[14px] font-semibold text-[var(--primary-text)] mb-3 flex items-center gap-2">
                        <AlertTriangle size={16} className="text-amber-400" />
                        Potential Breaking Changes &amp; Contract Regressions
                      </h4>
                      <ul className="space-y-2">
                        {data.ai_explanation.breaking_risks.map((risk, rIdx) => (
                          <li
                            key={rIdx}
                            className="p-3 rounded-[8px] bg-[var(--surface)] border border-[var(--border)] text-[12px] text-[var(--primary-text)] flex items-start gap-2"
                          >
                            <span className="text-amber-400 mt-0.5">•</span>
                            <span>{risk}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Component Impacts */}
                  {data.ai_explanation.component_impacts && data.ai_explanation.component_impacts.length > 0 && (
                    <div>
                      <h4 className="text-[14px] font-semibold text-[var(--primary-text)] mb-3 flex items-center gap-2">
                        <Layers size={16} className="text-indigo-400" />
                        Per-Component Downstream Impact
                      </h4>
                      <div className="grid grid-cols-1 gap-3">
                        {data.ai_explanation.component_impacts.map((ci, cIdx) => (
                          <div
                            key={cIdx}
                            className="p-3 rounded-[8px] bg-[var(--surface)] border border-[var(--border)]"
                          >
                            <div className="font-mono text-[12px] font-semibold text-indigo-300 mb-1">
                              {ci.component}
                            </div>
                            <p className="text-[12px] text-[var(--secondary-text)]">
                              {ci.risk}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Verification Checklist */}
                  {data.ai_explanation.verification_checklist && data.ai_explanation.verification_checklist.length > 0 && (
                    <div>
                      <h4 className="text-[14px] font-semibold text-[var(--primary-text)] mb-3 flex items-center gap-2">
                        <TestTube2 size={16} className="text-emerald-400" />
                        Recommended Verification Checklist
                      </h4>
                      <ul className="space-y-2">
                        {data.ai_explanation.verification_checklist.map((item, vIdx) => (
                          <li
                            key={vIdx}
                            className="p-3 rounded-[8px] bg-[var(--surface)] border border-[var(--border)] text-[12px] text-[var(--primary-text)] flex items-start gap-2"
                          >
                            <span className="text-emerald-400 font-bold mt-0.5">✓</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: Suggested Tests */}
              {activeTab === "tests" && (
                <div>
                  <div className="p-3 rounded-[8px] bg-[var(--surface)] border border-[var(--border)] mb-4 text-[12px] text-[var(--secondary-text)] flex items-center justify-between">
                    <span>
                      Tests identified via AST dependency traversal that exercise the changed files or their direct dependents.
                    </span>
                    <span className="text-[11px] font-medium text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                      Suggested (Not Executed)
                    </span>
                  </div>

                  {data.suggested_tests.length === 0 ? (
                    <div className="text-center py-16 text-[var(--secondary-text)]">
                      <TestTube2 size={36} className="mx-auto mb-3 opacity-40" />
                      <p className="text-[14px] font-semibold text-[var(--primary-text)]">
                        No directly importing test files found
                      </p>
                      <p className="text-[12px] max-w-md mx-auto mt-1">
                        None of the existing test suites directly import the modified modules. Consider adding unit or integration tests for the changed symbols.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {data.suggested_tests.map((t, idx) => (
                        <div
                          key={idx}
                          className="p-4 rounded-[10px] bg-[var(--surface)] border border-[var(--border)] flex items-center justify-between gap-4"
                        >
                          <div>
                            <div className="font-mono text-[13px] font-medium text-[var(--primary-text)]">
                              {t.path}
                            </div>
                            <p className="text-[12px] text-[var(--secondary-text)] mt-1">
                              {t.reason}
                            </p>
                          </div>
                          <span className="px-2.5 py-1 rounded-[6px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[11px] font-medium flex-shrink-0">
                            Suggested Test
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: Limitations */}
              {activeTab === "limitations" && (
                <div className="space-y-6">
                  {/* Analysis Boundaries */}
                  <div>
                    <h4 className="text-[14px] font-semibold text-[var(--primary-text)] mb-3">
                      Static Analysis Boundaries
                    </h4>
                    <ul className="space-y-2">
                      {data.limitations.map((lim, idx) => (
                        <li
                          key={idx}
                          className="p-3 rounded-[8px] bg-[var(--surface)] border border-[var(--border)] text-[12px] text-[var(--secondary-text)] flex items-start gap-2"
                        >
                          <span className="text-indigo-400 mt-0.5">•</span>
                          <span>{lim}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Unresolved Dependencies */}
                  {data.unresolved_dependencies.length > 0 && (
                    <div>
                      <h4 className="text-[14px] font-semibold text-[var(--primary-text)] mb-3">
                        Unresolved Dynamic &amp; Non-Literal Imports ({data.unresolved_dependencies.length})
                      </h4>
                      <div className="space-y-2">
                        {data.unresolved_dependencies.map((unres, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-[8px] bg-[var(--surface)] border border-[var(--border)] text-[12px] flex items-center justify-between"
                          >
                            <div>
                              <span className="font-mono text-[var(--primary-text)] font-medium">
                                {unres.source_file}:{unres.line}
                              </span>
                              <span className="text-[var(--secondary-text)] ml-2">
                                import {unres.specifier}
                              </span>
                            </div>
                            <span className="text-[11px] text-amber-400">
                              {unres.reason}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
