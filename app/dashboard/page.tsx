"use client";

import { useEffect, useState } from "react";
import AppSidebar from "@/components/layout/AppSidebar";
import RepositoryCard from "@/components/dashboard/RepositoryCard";
import UploadModal from "@/components/dashboard/UploadModal";
import SearchModal from "@/components/dashboard/SearchModal";
import HeaderActions from "@/components/dashboard/HeaderActions";
import { Search, Bell, HelpCircle, Sparkles, Upload, ArrowRight, Loader2, FolderPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchApi, Repository, User, ChatSession } from "@/lib/api";
import QuestionCard from "@/components/dashboard/QuestionCard";
import AskAiModal from "@/components/dashboard/AskAiModal";



export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isAskAiModalOpen, setIsAskAiModalOpen] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    setError("");
    try {
      // Parallel requests for speed
      const [userData, reposData, chatsData] = await Promise.all([
        fetchApi("/auth/me"),
        fetchApi("/repositories"),
        fetchApi("/chat-sessions").catch(() => []) // Optional, don't fail if no chats
      ]);
      setUser(userData);
      
      // Sort repos by upload_date descending
      const sortedRepos = reposData.sort((a: any, b: any) => 
        new Date(b.upload_date).getTime() - new Date(a.upload_date).getTime()
      );
      setRepositories(sortedRepos);

      // Sort chats by created_at descending
      const sortedChats = (chatsData || []).sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setChatSessions(sortedChats);
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [router]);

  // Polling for processing/embedding repositories
  useEffect(() => {
    const isProcessing = repositories.some(
      r => r.status === "processing" || r.status === "embedding"
    );
    
    if (isProcessing) {
      const interval = setInterval(async () => {
        try {
          const reposData = await fetchApi("/repositories");
          const sortedRepos = reposData.sort((a: any, b: any) => 
            new Date(b.upload_date).getTime() - new Date(a.upload_date).getTime()
          );
          setRepositories(sortedRepos);
        } catch (e) {
          console.error("Polling failed", e);
        }
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [repositories]);

  const handleUploadSuccess = () => {
    setIsUploadModalOpen(false);
    loadData();
  };

  const handleChatClick = (chatId: string, repoId: string) => {
    router.push(`/repository/${repoId}?chat=${chatId}`);
  };

  return (
    <div className="flex h-screen bg-[var(--background)] overflow-hidden">
      <AppSidebar />

      {/* Main area */}
      <div className="flex-1 flex flex-col ml-14 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center gap-4 px-6 h-14 border-b border-[var(--border)] bg-[var(--background)] flex-shrink-0">
          <SearchModal />
          <HeaderActions />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-8 relative">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="animate-spin text-[var(--muted-text)]" size={32} />
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex items-center justify-center flex-col">
              <div className="p-4 rounded-[10px] bg-red-500/10 border border-red-500/20 text-red-500 max-w-md text-center">
                <p className="font-semibold text-[14px] mb-1">Failed to load dashboard</p>
                <p className="text-[13px] opacity-80">{error}</p>
                <button 
                  onClick={loadData}
                  className="mt-4 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-[6px] text-[13px] transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Greeting */}
              <div className="flex items-start justify-between mb-10">
                <div>
                  <h1 className="text-[32px] font-bold text-[var(--primary-text)] tracking-tight leading-tight">
                    Good Evening, {user?.email?.split("@")[0] || "Developer"}
                  </h1>
                  <p className="text-[14px] text-[var(--secondary-text)] mt-1">
                    {repositories.length} repositories indexed
                  </p>
                </div>
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <button
                    id="ask-ai-btn"
                    onClick={() => setIsAskAiModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--secondary-text)] hover:text-[var(--primary-text)] hover:border-[var(--border-hover)] transition-all font-medium"
                  >
                    <Sparkles size={14} />
                    Ask AI
                  </button>
                  <button
                    onClick={() => setIsUploadModalOpen(true)}
                    id="upload-repo-btn"
                    className="flex items-center gap-2 px-4 py-2 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--primary-text)] hover:border-[var(--border-hover)] hover:bg-[var(--surface)] transition-all font-medium"
                  >
                    <Upload size={14} />
                    Upload
                  </button>
                </div>
              </div>

              {repositories.length === 0 ? (
                /* Empty state */
                <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-[var(--border)] rounded-[14px] bg-[var(--surface)]/50 mt-10">
                  <div className="w-16 h-16 bg-[var(--surface-hover)] rounded-full flex items-center justify-center mb-6">
                    <FolderPlus size={32} className="text-[var(--secondary-text)]" />
                  </div>
                  <h3 className="text-[18px] font-semibold text-[var(--primary-text)] mb-2">No repositories yet</h3>
                  <p className="text-[14px] text-[var(--secondary-text)] text-center max-w-sm mb-8">
                    Upload your first codebase as a ZIP file to start analyzing, searching, and chatting with your code.
                  </p>
                  <button
                    onClick={() => setIsUploadModalOpen(true)}
                    className="px-6 py-3 rounded-[10px] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] text-[14px] font-semibold hover:bg-white transition-all flex items-center gap-2"
                  >
                    <Upload size={16} />
                    Upload Repository
                  </button>
                </div>
              ) : (
                /* Two-column layout */
                <div className="grid grid-cols-[1fr_260px] gap-8">
                  {/* Left column */}
                  <div>
                    {/* Active Repositories */}
                    <div className="mb-10">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-[11px] font-semibold text-[var(--muted-text)] uppercase tracking-widest">
                          Active Repositories
                        </h2>
                        <Link
                          href="#"
                          className="flex items-center gap-1 text-[12px] text-[var(--secondary-text)] hover:text-[var(--primary-text)] transition-colors"
                        >
                          View All
                          <ArrowRight size={12} />
                        </Link>
                      </div>
                      <div className="space-y-1">
                        {repositories.slice(0, 5).map((repo) => (
                          <RepositoryCard key={repo.id} repo={repo} />
                        ))}
                      </div>
                    </div>

                    {/* Recent Questions */}
                    <div>
                      <h2 className="text-[11px] font-semibold text-[var(--muted-text)] uppercase tracking-widest mb-4">
                        Recent Questions
                      </h2>
                      <div className="grid grid-cols-2 gap-2.5">
                        {chatSessions.length === 0 ? (
                          <div className="col-span-2 text-[12px] text-[var(--muted-text)] italic">
                            No chat sessions yet. Ask AI to start one.
                          </div>
                        ) : (
                          chatSessions.slice(0, 4).map((c) => (
                            <div key={c.id} onClick={() => handleChatClick(c.id, c.repository_id)}>
                              <QuestionCard question={{ title: c.title, time: new Date(c.created_at).toLocaleDateString() } as any} />
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right column — Recent Activity */}
                  <div>
                    <h2 className="text-[11px] font-semibold text-[var(--muted-text)] uppercase tracking-widest mb-4">
                      Recent Activity
                    </h2>
                    <div>
                      {/* Empty activity state since we don't have backend for this yet */}
                      <p className="text-[13px] text-[var(--muted-text)] italic">No recent activity.</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
      
      <UploadModal 
        isOpen={isUploadModalOpen} 
        onClose={() => setIsUploadModalOpen(false)} 
        onSuccess={handleUploadSuccess} 
      />
      <AskAiModal
        isOpen={isAskAiModalOpen}
        onClose={() => setIsAskAiModalOpen(false)}
        repositories={repositories}
        onUploadClick={() => setIsUploadModalOpen(true)}
      />
    </div>
  );
}
