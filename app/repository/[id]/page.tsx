"use client";

import { useState, use, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { History, Loader2, Sparkles } from "lucide-react";
import RepoSidebar from "@/components/repository/RepoSidebar";
import ChatMessage from "@/components/repository/ChatMessage";
import ChatInput from "@/components/repository/ChatInput";
import SourceViewerModal from "@/components/repository/SourceViewerModal";
import FileExplorer from "@/components/repository/FileExplorer";
import { 
  fetchApi, 
  reindexRepository, 
  RepositoryDetail, 
  ChatMessageType,
  ChatSession,
  getChatSessions,
  createChatSession,
  getChatSessionDetail,
  updateChatSession,
  deleteChatSession,
  API_BASE_URL
} from "@/lib/api";

interface PageProps {
  params: Promise<{ id: string }>;
}

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

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadRepo = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/login");
        return;
      }

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
        sources: [] // We might need to persist sources in DB later, for now leave empty on reload
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
      const res = await fetch(`${API_BASE_URL}/repositories/chat-sessions/${currentSessionId}/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ question: text }),
        signal: abortControllerRef.current.signal
      });

      if (!res.ok) {
        throw new Error(`Failed to stream: ${res.statusText}`);
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
      <div className="flex h-screen bg-[#09090B] items-center justify-center">
        <Loader2 className="animate-spin text-[#52525b]" size={32} />
      </div>
    );
  }

  if (error || !repo) {
    return (
      <div className="flex h-screen bg-[#09090B] items-center justify-center flex-col">
        <div className="p-6 rounded-[10px] bg-[#111113] border border-[#27272A] max-w-md text-center">
          <h2 className="text-[18px] font-semibold text-[#FAFAFA] mb-2">Error</h2>
          <p className="text-[14px] text-[#A1A1AA] mb-6">{error || "Repository not found."}</p>
          <button 
            onClick={() => router.push("/dashboard")}
            className="px-4 py-2 bg-[#FAFAFA] text-[#09090B] font-medium rounded-[6px] text-[13px] hover:bg-white transition-colors"
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
      alert(`Failed to re-index: ${err.message}`);
    }
  };

  const dateStr = new Date(repo.upload_date).toLocaleDateString();

  return (
    <div className="flex h-screen bg-[#09090B] overflow-hidden">
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
        <header className="flex items-center justify-between px-6 h-14 border-b border-[#27272A] bg-[#09090B] flex-shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-[15px] font-semibold text-[#FAFAFA]">{repo.name}</h1>
            <div className="flex items-center gap-2 text-[13px] text-[#A1A1AA]">
              {repo.file_count !== undefined && (
                <>
                  <span>{repo.file_count} files</span>
                  <span className="text-[#3f3f46]">•</span>
                </>
              )}
              <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 text-[11px] font-medium border border-emerald-900 capitalize">
                {repo.status}
              </span>
              <span className="text-[#3f3f46]">•</span>
              {repo.languages && repo.languages.length > 0 && (
                <>
                  <span>{repo.languages.slice(0, 3).join(" • ")}</span>
                  <span className="text-[#3f3f46]">•</span>
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
              onClick={handleReindex}
              className="px-3 py-1.5 rounded-[8px] border border-[#27272A] text-[#A1A1AA] text-[12px] hover:text-[#FAFAFA] hover:bg-[#111113] transition-all mr-2"
            >
              Re-index
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden">
          {activeTab === "chat" && (
            <div className="flex-1 flex flex-col overflow-hidden relative">
              <div className="flex-1 overflow-y-auto px-8 py-8 space-y-10">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="w-16 h-16 bg-[#1a1a1d] rounded-full flex items-center justify-center mb-6">
                      <Sparkles size={32} className="text-[#A1A1AA]" />
                    </div>
                    <h3 className="text-[20px] font-semibold text-[#FAFAFA] mb-2">
                      Ask anything about {repo.name}
                    </h3>
                    <p className="text-[14px] text-[#A1A1AA] max-w-md">
                      CodeBase AI has analyzed your repository. You can now ask questions about the architecture, logic, or request specific code explanations.
                    </p>
                    <div className="mt-8 flex flex-wrap justify-center gap-2 max-w-2xl">
                      {suggestions.map((q, i) => (
                        <button
                          key={i}
                          onClick={() => handleSend(q)}
                          className="px-4 py-2 rounded-[8px] border border-[#27272A] bg-[#111113] text-[13px] text-[#A1A1AA] hover:text-[#FAFAFA] hover:border-[#3f3f46] transition-all"
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
                      <div className="flex items-center gap-2 text-[#A1A1AA] text-[12px] animate-pulse">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#A1A1AA] animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-[#A1A1AA] animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-[#A1A1AA] animate-bounce" style={{ animationDelay: "300ms" }} />
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
                  <h2 className="text-[24px] font-bold text-[#FAFAFA]">Repository Overview</h2>
                  <button 
                    onClick={async () => {
                      try {
                        const updatedRepo = await fetchApi(`/repositories/${repo.id}/generate-summary`, { method: "POST" });
                        setRepo(prev => prev ? { ...prev, ...updatedRepo } : prev);
                      } catch (e) {
                        // error handled in fetchApi wrapper or toast
                      }
                    }}
                    className="px-3 py-1.5 rounded-[8px] bg-[#111113] border border-[#27272A] text-[#A1A1AA] text-[12px] hover:text-[#FAFAFA] transition-all"
                  >
                    Regenerate Summary
                  </button>
                </div>

                {repo.summary ? (
                  <div className="prose prose-invert max-w-none text-[14px]">
                    <div dangerouslySetInnerHTML={{ __html: repo.summary.replace(/\n/g, '<br/>') }} />
                  </div>
                ) : (
                  <div className="text-center py-20 text-[#A1A1AA] text-[14px]">
                    No summary generated yet. Click 'Regenerate Summary' to create one.
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
        startLine={viewerSource?.start_line}
        endLine={viewerSource?.end_line}
      />
    </div>
  );
}
