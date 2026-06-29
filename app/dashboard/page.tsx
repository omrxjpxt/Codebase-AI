"use client";

import { useEffect, useState } from "react";
import AppSidebar from "@/components/layout/AppSidebar";
import RepositoryCard from "@/components/dashboard/RepositoryCard";
import UploadModal from "@/components/dashboard/UploadModal";
import { Search, Bell, HelpCircle, Sparkles, Upload, ArrowRight, Loader2, FolderPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchApi, Repository, User } from "@/lib/api";
import QuestionCard from "@/components/dashboard/QuestionCard"; // We will still use this

// Generic questions for now
const recentQuestions = [
  { id: "q1", title: "How does the authentication flow work?", time: "Just now" },
  { id: "q2", title: "Where are the database models defined?", time: "2h ago" },
  { id: "q3", title: "Explain the main state management strategy.", time: "5h ago" },
  { id: "q4", title: "What are the core external dependencies?", time: "1d ago" },
];

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    setError("");
    try {
      // Parallel requests for speed
      const [userData, reposData] = await Promise.all([
        fetchApi("/auth/me"),
        fetchApi("/repositories")
      ]);
      setUser(userData);
      
      // Sort repos by upload_date descending
      const sortedRepos = reposData.sort((a: any, b: any) => 
        new Date(b.upload_date).getTime() - new Date(a.upload_date).getTime()
      );
      setRepositories(sortedRepos);
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    loadData();
  }, [router]);

  const handleUploadSuccess = () => {
    setIsUploadModalOpen(false);
    loadData();
  };

  const handleQuestionClick = (question: string) => {
    if (repositories.length > 0) {
      const latestRepo = repositories[0];
      router.push(`/repository/${latestRepo.id}?q=${encodeURIComponent(question)}`);
    } else {
      setIsUploadModalOpen(true);
    }
  };

  return (
    <div className="flex h-screen bg-[#09090B] overflow-hidden">
      <AppSidebar />

      {/* Main area */}
      <div className="flex-1 flex flex-col ml-14 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center gap-4 px-6 h-14 border-b border-[#27272A] bg-[#09090B] flex-shrink-0">
          {/* Search */}
          <div className="flex-1 max-w-lg">
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-[8px] bg-[#111113] border border-[#27272A] hover:border-[#3f3f46] transition-colors cursor-text group">
              <Search size={14} className="text-[#52525b]" />
              <span className="text-[13px] text-[#52525b] flex-1">
                Search repositories, files, functions, or chats...
              </span>
              <div className="flex items-center gap-1 flex-shrink-0">
                <kbd className="px-1.5 py-0.5 rounded-[4px] bg-[#1a1a1d] border border-[#27272A] text-[10px] text-[#52525b] font-mono">⌘</kbd>
                <kbd className="px-1.5 py-0.5 rounded-[4px] bg-[#1a1a1d] border border-[#27272A] text-[10px] text-[#52525b] font-mono">K</kbd>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button className="w-8 h-8 rounded-[8px] flex items-center justify-center text-[#52525b] hover:text-[#A1A1AA] hover:bg-[#111113] transition-all">
              <Bell size={16} />
            </button>
            <button className="w-8 h-8 rounded-[8px] flex items-center justify-center text-[#52525b] hover:text-[#A1A1AA] hover:bg-[#111113] transition-all">
              <HelpCircle size={16} />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-8 relative">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="animate-spin text-[#52525b]" size={32} />
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
                  <h1 className="text-[32px] font-bold text-[#FAFAFA] tracking-tight leading-tight">
                    Good Evening, {user?.email?.split("@")[0] || "Developer"}
                  </h1>
                  <p className="text-[14px] text-[#A1A1AA] mt-1">
                    {repositories.length} repositories indexed
                  </p>
                </div>
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <button
                    id="ask-ai-btn"
                    className="flex items-center gap-2 px-4 py-2 rounded-[8px] border border-[#27272A] text-[13px] text-[#A1A1AA] hover:text-[#FAFAFA] hover:border-[#3f3f46] transition-all font-medium"
                  >
                    <Sparkles size={14} />
                    Ask AI
                  </button>
                  <button
                    onClick={() => setIsUploadModalOpen(true)}
                    id="upload-repo-btn"
                    className="flex items-center gap-2 px-4 py-2 rounded-[8px] border border-[#27272A] text-[13px] text-[#FAFAFA] hover:border-[#3f3f46] hover:bg-[#111113] transition-all font-medium"
                  >
                    <Upload size={14} />
                    Upload
                  </button>
                </div>
              </div>

              {repositories.length === 0 ? (
                /* Empty state */
                <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-[#27272A] rounded-[14px] bg-[#111113]/50 mt-10">
                  <div className="w-16 h-16 bg-[#1a1a1d] rounded-full flex items-center justify-center mb-6">
                    <FolderPlus size={32} className="text-[#A1A1AA]" />
                  </div>
                  <h3 className="text-[18px] font-semibold text-[#FAFAFA] mb-2">No repositories yet</h3>
                  <p className="text-[14px] text-[#A1A1AA] text-center max-w-sm mb-8">
                    Upload your first codebase as a ZIP file to start analyzing, searching, and chatting with your code.
                  </p>
                  <button
                    onClick={() => setIsUploadModalOpen(true)}
                    className="px-6 py-3 rounded-[10px] bg-[#FAFAFA] text-[#09090B] text-[14px] font-semibold hover:bg-white transition-all flex items-center gap-2"
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
                        <h2 className="text-[11px] font-semibold text-[#52525b] uppercase tracking-widest">
                          Active Repositories
                        </h2>
                        <Link
                          href="#"
                          className="flex items-center gap-1 text-[12px] text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
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
                      <h2 className="text-[11px] font-semibold text-[#52525b] uppercase tracking-widest mb-4">
                        Recent Questions
                      </h2>
                      <div className="grid grid-cols-2 gap-2.5">
                        {recentQuestions.map((q) => (
                          <div key={q.id} onClick={() => handleQuestionClick(q.title)}>
                            <QuestionCard question={q as any} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right column — Recent Activity */}
                  <div>
                    <h2 className="text-[11px] font-semibold text-[#52525b] uppercase tracking-widest mb-4">
                      Recent Activity
                    </h2>
                    <div>
                      {/* Empty activity state since we don't have backend for this yet */}
                      <p className="text-[13px] text-[#52525b] italic">No recent activity.</p>
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
    </div>
  );
}
