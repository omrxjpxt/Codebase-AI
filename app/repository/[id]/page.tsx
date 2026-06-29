"use client";

import { useState, use, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { History, Loader2, Sparkles } from "lucide-react";
import RepoSidebar from "@/components/repository/RepoSidebar";
import ChatMessage from "@/components/repository/ChatMessage";
import ChatInput from "@/components/repository/ChatInput";
import { fetchApi, askRepositoryQuestion, RepositoryDetail, ChatMessageType } from "@/lib/api";

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

  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    const loadRepo = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/login");
        return;
      }

      setIsLoading(true);
      try {
        console.log("Repository ID:", id);
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(id)) {
          setError("Invalid repository ID.");
          setIsLoading(false);
          return;
        }

        const repoData = await fetchApi(`/repositories/${id}`);
        setRepo(repoData);

        // Simulated follow-up questions
        setSuggestions([
          "Explain the architecture",
          "What dependencies does this use?",
          "How does the database connection work?",
        ]);

        if (initialQuery) {
          // Process initial query if provided via dashboard
          handleSend(initialQuery);
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
  }, [id, router]);

  const handleSend = async (text: string) => {
    const userMsg: ChatMessageType = {
      id: `msg-${Date.now()}-user`,
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    const tempAiId = `msg-${Date.now()}-ai-loading`;
    const aiMsg: ChatMessageType = {
      id: tempAiId,
      role: "assistant",
      content: "Analyzing repository...",
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg, aiMsg]);

    try {
      const response = await askRepositoryQuestion(id, text);
      setMessages((prev) => 
        prev.map((msg) => 
          msg.id === tempAiId ? { ...msg, content: response.answer, id: `msg-${Date.now()}-ai` } : msg
        )
      );
    } catch (err: any) {
      setMessages((prev) => 
        prev.map((msg) => 
          msg.id === tempAiId ? { ...msg, content: `Error: ${err.message || 'Failed to get an answer.'}` } : msg
        )
      );
    }
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

  const dateStr = new Date(repo.upload_date).toLocaleDateString();

  return (
    <div className="flex h-screen bg-[#09090B] overflow-hidden">
      {/* Repo left sidebar */}
      <RepoSidebar repo={repo} />

      {/* Main chat area */}
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
            <button className="w-8 h-8 rounded-[8px] flex items-center justify-center text-[#52525b] hover:text-[#A1A1AA] hover:bg-[#111113] transition-all">
              <History size={16} />
            </button>
            <div className="w-7 h-7 rounded-full bg-[#27272A] border border-[#3f3f46] flex items-center justify-center text-[11px] font-medium text-[#A1A1AA]">
              O
            </div>
          </div>
        </header>

        {/* Chat + right sidebar */}
        <div className="flex flex-1 overflow-hidden">
          {/* Chat scroll area */}
          <div className="flex-1 flex flex-col overflow-hidden relative">
            {/* Messages */}
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
                    <ChatMessage key={msg.id} message={msg} />
                  ))}

                  {/* Follow-up suggestions at bottom of chat */}
                  <div className="pt-4">
                    <p className="text-[11px] uppercase tracking-widest text-[#52525b] mb-3 font-medium">
                      Follow Up Questions
                    </p>
                    <div className="flex flex-col gap-2">
                      {suggestions.slice(0, 3).map((q, i) => (
                        <button
                          key={i}
                          onClick={() => handleSend(q)}
                          className="text-left px-4 py-2.5 rounded-[8px] border border-[#27272A] text-[13px] text-[#A1A1AA] hover:text-[#FAFAFA] hover:border-[#3f3f46] hover:bg-[#111113] transition-all w-fit"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Fixed chat input */}
            <div className="px-8 pb-6 flex-shrink-0">
              <ChatInput onSend={handleSend} />
            </div>
          </div>

          {/* Right sidebar */}
          <div className="w-[220px] flex-shrink-0 border-l border-[#27272A] overflow-y-auto p-5">
            {/* Repository Context */}
            <div className="mb-8">
              <p className="text-[10px] uppercase tracking-widest text-[#52525b] font-medium mb-4">
                Repository Context
              </p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[#A1A1AA]">Files</span>
                  <span className="text-[13px] text-[#FAFAFA] font-medium">{repo.file_count || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[#A1A1AA]">Chunks</span>
                  <span className="text-[13px] text-[#FAFAFA] font-medium">{repo.chunk_count || 0}</span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[13px] text-[#A1A1AA]">Languages</span>
                  <span className="text-[13px] text-[#FAFAFA] font-medium text-right">
                    {repo.languages && repo.languages.length > 0 ? repo.languages.join(", ") : "Unknown"}
                  </span>
                </div>
              </div>
            </div>

            {/* Recent Files */}
            <div className="mb-8">
              <p className="text-[10px] uppercase tracking-widest text-[#52525b] font-medium mb-3">
                Recent Files
              </p>
              <div className="space-y-1.5">
                <p className="text-[12px] text-[#52525b] italic">No files accessed recently.</p>
              </div>
            </div>

            {/* Recent Questions */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#52525b] font-medium mb-3">
                Recent Questions
              </p>
              <div className="space-y-2">
                 <p className="text-[12px] text-[#52525b] italic">No recent questions.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
