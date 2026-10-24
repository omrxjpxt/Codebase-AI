"use client";

import { useState, use, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { History, Loader2, Sparkles, Flame } from "lucide-react";
import RepoSidebar from "@/components/repository/RepoSidebar";
import ChatMessage from "@/components/repository/ChatMessage";
import ChatInput from "@/components/repository/ChatInput";
import SourceViewerModal from "@/components/repository/SourceViewerModal";
import FileExplorer from "@/components/repository/FileExplorer";
import ImpactAnalysisModal from "@/components/repository/ImpactAnalysisModal";
import ChangeSetModal from "@/components/repository/ChangeSetModal";
import { 
  fetchApi, 
  reindexRepository, 
  RepositoryDetail, 
  ChatMessageType,
  ChatSession,
  getChatSessions,
  createChatSession,
  updateChatSession,
  getChatSessionDetail,
  deleteChatSession,
  API_BASE_URL
} from "@/lib/api";
import { toast } from "sonner";

interface PageProps {
  params: Promise<{ id: string }>;
}

const statusBadgeConfig: Record<string, { label: string; bg: string; text: string; border: string }> = {
  indexed: { label: "Indexed", bg: "bg-emerald-950/60", text: "text-emerald-400", border: "border-emerald-900/60" },
  partially_indexed: { label: "Partially Indexed", bg: "bg-amber-950/60", text: "text-amber-400", border: "border-amber-900/60" },
  completed: { label: "Ingested", bg: "bg-yellow-950/60", text: "text-yellow-400", border: "border-yellow-900/60" },
  indexing: { label: "Indexing...", bg: "bg-blue-950/60", text: "text-blue-400", border: "border-blue-900/60" },
  pending: { label: "Pending", bg: "bg-zinc-900", text: "text-zinc-400", border: "border-zinc-800" },
  processing: { label: "Processing", bg: "bg-blue-950/60", text: "text-blue-400", border: "border-blue-900/60" },
  failed: { label: "Failed", bg: "bg-red-950/60", text: "text-red-400", border: "border-red-900/60" },
};

export default function RepositoryPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q");

  const [repo, setRepo] = useState<RepositoryDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("chat");

  // Source Viewer state
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewerSource, setViewerSource] = useState<any>(null);

  // Impact Analysis state
  const [isImpactOpen, setIsImpactOpen] = useState(false);
  const [impactFilePath, setImpactFilePath] = useState("");

  // Change Set Blast Radius state
  const [isChangeSetOpen, setIsChangeSetOpen] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadRepo = async () => {
      setIsLoading(true);
      try {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(id)) {
          setError("Invalid repository ID.");
          setIsLoading(false);
          return;
        }

        const repoData = await fetchApi(`/repositories/${id}`);
        setRepo(repoData);

        const sessions = await getChatSessions(id);
        setChatSessions(sessions);
        
        const urlChatId = searchParams.get("chat");
        if (urlChatId && sessions.some(s => s.id === urlChatId)) {
          loadSession(urlChatId);
        } else if (sessions.length > 0) {
          loadSession(sessions[0].id);
        } else {
          // If initialQuery is present, we'll create a session in handleSend
        }

        setSuggestions([
          "Explain the architecture",
          "What dependencies does this use?",
          "How does the database connection work?",
        ]);

        if (initialQuery) {
          setTimeout(() => handleSend(initialQuery), 500);
        }
      } catch (err: any) {
        const msg = err.message || "";
        if (msg.includes("404") || msg.includes("422") || msg.includes("valid UUID")) {
          setError("Repository not found.");
        } else {
          setError(msg || "Failed to load repository.");
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadRepo();
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [id, router]);

  // Polling while repository is actively indexing or processing
  useEffect(() => {
    if (repo?.status === "indexing" || repo?.status === "processing" || repo?.status === "pending") {
      const interval = setInterval(async () => {
        try {
          const updatedRepo = await fetchApi(`/repositories/${id}`);
          setRepo(updatedRepo);
        } catch (e) {
          console.error("Polling repository status failed", e);
        }
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [repo?.status, id]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

  const loadSession = async (sessionId: string) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    setIsStreaming(false);
    
    try {
      const detail = await getChatSessionDetail(sessionId);
      setActiveSessionId(detail.id);
      setMessages(detail.messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.created_at || "",
        sources: m.sources || []
      })));
    } catch (err) {
      console.error("Failed to load session", err);
    }
  };

  const handleNewSession = async () => {
    try {
      const session = await createChatSession(id, "New Chat");
      setChatSessions(prev => [session, ...prev]);
      setActiveSessionId(session.id);
      setMessages([]);
    } catch (err) {
      console.error("Failed to create session", err);
    }
  };

  const handleRenameSession = async (sessionId: string, newTitle: string) => {
    try {
      const updated = await updateChatSession(sessionId, newTitle);
      setChatSessions(prev => prev.map(s => s.id === sessionId ? updated : s));
    } catch (err) {
      console.error("Failed to rename session", err);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await deleteChatSession(sessionId);
      setChatSessions(prev => prev.filter(s => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        setMessages([]);
        setActiveSessionId(null);
      }
    } catch (err) {
      console.error("Failed to delete session", err);
    }
  };

  const handleSend = async (text: string) => {
    if (isStreaming) return;
    
    let currentSessionId = activeSessionId;
    if (!currentSessionId) {
      const session = await createChatSession(id, text.slice(0, 30) + (text.length > 30 ? "..." : ""));
      setChatSessions(prev => [session, ...prev]);
      setActiveSessionId(session.id);
      currentSessionId = session.id;
    }

    const userMsg: ChatMessageType = {
      id: `msg-${Date.now()}-user`,
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    const aiMsgId = `msg-${Date.now()}-ai`;
    const aiMsg: ChatMessageType = {
      id: aiMsgId,
      role: "assistant",
      content: "", // Starts empty
      timestamp: new Date().toISOString(),
      sources: []
    };
    
    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setIsStreaming(true);

    abortControllerRef.current = new AbortController();

    try {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE_URL}/repositories/chat-sessions/${currentSessionId}/ask`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ question: text }),
        signal: abortControllerRef.current.signal
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to stream: ${res.statusText || res.status}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder("utf-8");

      if (!reader) throw new Error("No reader");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunkStr = decoder.decode(value, { stream: true });
        const lines = chunkStr.split('\n').filter(l => l.trim() !== "");
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.type === "sources") {
              setMessages(prev => prev.map(m => 
                m.id === aiMsgId ? { ...m, sources: data.data } : m
              ));
            } else if (data.type === "readiness") {
              if (data.data) {
                setRepo(prev => prev ? {
                  ...prev,
                  indexed_chunk_count: data.data.indexed_chunks,
                  chunk_count: data.data.total_chunks,
                  is_indexed: data.data.is_indexed
                } : prev);
              }
            } else if (data.type === "chunk") {
              setMessages(prev => prev.map(m => 
                m.id === aiMsgId ? { ...m, content: m.content + data.text } : m
              ));
            } else if (data.type === "error") {
              setMessages(prev => prev.map(m => 
                m.id === aiMsgId ? { ...m, content: m.content + `\n\n[Error: ${data.message}]` } : m
              ));
            }
          } catch (e) {
            console.error("Failed to parse stream line:", line);
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages((prev) => 
          prev.map((msg) => 
            msg.id === aiMsgId ? { ...msg, content: msg.content + `\n\n[Stream Error: ${err.message}]` } : msg
          )
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleSourceClick = (source: any) => {
    setViewerSource(source);
    setIsViewerOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex h-screen bg-[var(--background)] items-center justify-center">
        <Loader2 className="animate-spin text-[var(--muted-text)]" size={32} />
      </div>
    );
  }

  if (error || !repo) {
    return (
      <div className="flex h-screen bg-[var(--background)] items-center justify-center flex-col">
        <div className="p-6 rounded-[10px] bg-[var(--surface)] border border-[var(--border)] max-w-md text-center">
          <h2 className="text-[18px] font-semibold text-[var(--primary-text)] mb-2">Error</h2>
          <p className="text-[14px] text-[var(--secondary-text)] mb-6">{error || "Repository not found."}</p>
          <button 
            onClick={() => router.push("/dashboard")}
            className="px-4 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-medium rounded-[6px] text-[13px] hover:bg-white transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const handleReindex = async () => {
    try {
      const updatedRepo = await reindexRepository(id);
      setRepo(prev => prev ? { ...prev, ...updatedRepo } : prev);
      setError("");
    } catch (err: any) {
      toast.error(`Failed to re-index: ${err.message}`);
    }
  };

  const dateStr = new Date(repo.upload_date).toLocaleDateString();
  const badge = statusBadgeConfig[repo.status] || {
    label: repo.status,
    bg: "bg-zinc-900",
    text: "text-zinc-400",
    border: "border-zinc-800"
  };
  const badgeLabel = (repo.status === "partially_indexed" && repo.chunk_count && repo.indexed_chunk_count !== undefined)
    ? `Partially Indexed (${repo.indexed_chunk_count}/${repo.chunk_count})`
    : badge.label;

  return (
    <div className="flex h-screen bg-[var(--background)] overflow-hidden">
      <RepoSidebar 
        repo={repo} 
        chatSessions={chatSessions}
        activeSessionId={activeSessionId}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onSelectSession={loadSession}
        onNewSession={handleNewSession}
        onRenameSession={handleRenameSession}
        onDeleteSession={handleDeleteSession}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-6 h-14 border-b border-[var(--border)] bg-[var(--background)] flex-shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-[15px] font-semibold text-[var(--primary-text)]">{repo.name}</h1>
            <div className="flex items-center gap-2 text-[13px] text-[var(--secondary-text)]">
              {repo.file_count !== undefined && (
                <>
                  <span>{repo.file_count} files</span>
                  <span className="text-[var(--placeholder-text)]">•</span>
                </>
              )}
              <span className={`px-2 py-0.5 rounded-full ${badge.bg} ${badge.text} text-[11px] font-medium border ${badge.border} flex items-center gap-1.5`}>
                {repo.status === "indexing" && <Loader2 size={10} className="animate-spin" />}
                {badgeLabel}
              </span>
              <span className="text-[var(--placeholder-text)]">•</span>
              {repo.languages && repo.languages.length > 0 && (
                <>
                  <span>{repo.languages.slice(0, 3).join(" • ")}</span>
                  <span className="text-[var(--placeholder-text)]">•</span>
                </>
              )}
              <span>Uploaded {dateStr}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {repo.status === 'failed' && (
              <span className="text-red-400 text-[12px] mr-2" title={repo.error_message || ""}>
                Indexing Failed
              </span>
            )}
            <button 
              onClick={() => setIsChangeSetOpen(true)}
              className="px-3 py-1.5 rounded-[8px] border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-[12px] font-medium hover:bg-indigo-500/20 hover:border-indigo-500/50 transition-all flex items-center gap-1.5 mr-2"
            >
              <Flame size={14} className="text-indigo-400" />
              Analyze Changes
            </button>
            <button 
              onClick={handleReindex}
              disabled={repo.status === "indexing"}
              className="px-3 py-1.5 rounded-[8px] border border-[var(--border)] text-[var(--secondary-text)] text-[12px] hover:text-[var(--primary-text)] hover:bg-[var(--surface)] transition-all mr-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {repo.status === "indexing" ? "Indexing..." : "Re-index"}
            </button>
          </div>
        </header>

        {/* Readiness notice banners */}
        {repo.status === "partially_indexed" && (
          <div className="bg-amber-950/40 border-b border-amber-900/50 px-6 py-2 flex items-center justify-between text-[12px] text-amber-300 flex-shrink-0">
            <span>
              ⚠️ <strong>Partially Indexed:</strong> Only {repo.indexed_chunk_count || 0} of {repo.chunk_count || 0} code chunks are embedded. AI responses are grounded only in the indexed portions.
            </span>
            <button
              onClick={handleReindex}
              className="underline hover:text-amber-200 font-medium ml-4 transition-colors"
            >
              Resume Indexing
            </button>
          </div>
        )}
        {repo.status === "completed" && (
          <div className="bg-yellow-950/40 border-b border-yellow-900/50 px-6 py-2 flex items-center justify-between text-[12px] text-yellow-300 flex-shrink-0">
            <span>
              ℹ️ <strong>Ingestion Complete:</strong> Repository files are stored, but code embeddings have not been generated yet ({repo.chunk_count || 0} chunks pending).
            </span>
            <button
              onClick={handleReindex}
              className="underline hover:text-yellow-200 font-medium ml-4 transition-colors"
            >
              Start Indexing
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden">
          {activeTab === "chat" && (
            <div className="flex-1 flex flex-col overflow-hidden relative">
              <div className="flex-1 overflow-y-auto px-8 py-8 space-y-10">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="w-16 h-16 bg-[var(--surface-hover)] rounded-full flex items-center justify-center mb-6">
                      <Sparkles size={32} className="text-[var(--secondary-text)]" />
                    </div>
                    <h3 className="text-[20px] font-semibold text-[var(--primary-text)] mb-2">
                      Ask anything about {repo.name}
                    </h3>
                    <p className="text-[14px] text-[var(--secondary-text)] max-w-md">
                      CodeBase AI has analyzed your repository. You can now ask questions about the architecture, logic, or request specific code explanations.
                    </p>
                    <div className="mt-8 flex flex-wrap justify-center gap-2 max-w-2xl">
                      {suggestions.map((q, i) => (
                        <button
                          key={i}
                          onClick={() => handleSend(q)}
                          className="px-4 py-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[13px] text-[var(--secondary-text)] hover:text-[var(--primary-text)] hover:border-[var(--border-hover)] transition-all"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((msg) => (
                      <ChatMessage 
                        key={msg.id} 
                        message={msg} 
                        onSourceClick={handleSourceClick}
                      />
                    ))}
                    
                    {isStreaming && (
                      <div className="flex items-center gap-2 text-[var(--secondary-text)] text-[12px] animate-pulse">
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--secondary-text)] animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--secondary-text)] animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--secondary-text)] animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              <div className="px-8 pb-6 flex-shrink-0">
                <ChatInput onSend={handleSend} disabled={isStreaming} />
              </div>
            </div>
          )}

          {activeTab === "overview" && (
            <div className="flex-1 overflow-y-auto px-8 py-8">
              <div className="max-w-3xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-[24px] font-bold text-[var(--primary-text)]">Repository Overview</h2>
                  <button 
                    onClick={async () => {
                      try {
                        const updatedRepo = await fetchApi(`/repositories/${repo.id}/generate-summary`, { method: "POST" });
                        setRepo(prev => prev ? { ...prev, ...updatedRepo } : prev);
                      } catch (e) {
                        // error handled in fetchApi wrapper or toast
                      }
                    }}
                    className="px-3 py-1.5 rounded-[8px] bg-[var(--surface)] border border-[var(--border)] text-[var(--secondary-text)] text-[12px] hover:text-[var(--primary-text)] transition-all"
                  >
                    Regenerate Summary
                  </button>
                </div>

                {repo.summary ? (
                  <div className="prose prose-invert max-w-none text-[14px]">
                    <div dangerouslySetInnerHTML={{ __html: repo.summary.replace(/\n/g, '<br/>') }} />
                  </div>
                ) : (
                  <div className="text-center py-20 text-[var(--secondary-text)] text-[14px]">
                    No summary generated yet. Click &apos;Regenerate Summary&apos; to create one.
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "files" && (
            <div className="flex-1 overflow-y-auto px-8 py-8 flex">
              <FileExplorer 
                repositoryId={repo.id} 
                onFileClick={(fileId) => {
                  setViewerSource({ file_id: fileId });
                  setIsViewerOpen(true);
                }} 
                onAnalyzeImpact={(_fileId, filePath) => {
                  setImpactFilePath(filePath);
                  setIsImpactOpen(true);
                }}
              />
            </div>
          )}
        </div>
      </div>
      
      <SourceViewerModal
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        repositoryId={id}
        fileId={viewerSource?.file_id}
        filePath={viewerSource?.path}
        startLine={viewerSource?.start_line}
        endLine={viewerSource?.end_line}
        onAnalyzeImpact={(path) => {
          setIsViewerOpen(false);
          setImpactFilePath(path);
          setIsImpactOpen(true);
        }}
      />

      <ImpactAnalysisModal
        isOpen={isImpactOpen}
        onClose={() => setIsImpactOpen(false)}
        repositoryId={id}
        filePath={impactFilePath}
        onNavigateToFile={(fileId, path, line) => {
          setIsImpactOpen(false);
          setViewerSource({ file_id: fileId, path, start_line: line, end_line: line });
          setIsViewerOpen(true);
        }}
      />

      <ChangeSetModal
        isOpen={isChangeSetOpen}
        onClose={() => setIsChangeSetOpen(false)}
        repositoryId={id}
        onNavigateToFile={(fileId, path, line) => {
          setIsChangeSetOpen(false);
          setViewerSource({ file_id: fileId, path, start_line: line, end_line: line });
          setIsViewerOpen(true);
        }}
      />
    </div>
  );
}
