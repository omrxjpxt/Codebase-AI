"use client";

import { useEffect, useState } from "react";
import AppSidebar from "@/components/layout/AppSidebar";
import FileExplorer from "@/components/repository/FileExplorer";
import SourceViewerModal from "@/components/repository/SourceViewerModal";
import { fetchApi, Repository } from "@/lib/api";
import { FolderOpen, Folder, Trash2, Loader2, ChevronDown } from "lucide-react";
import { toast } from "sonner";

export default function FilesPage() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewerSource, setViewerSource] = useState<any>(null);
  const [showRepoDropdown, setShowRepoDropdown] = useState(false);

  useEffect(() => {
    const loadRepos = async () => {
      try {
        const repos: Repository[] = await fetchApi("/repositories");
        const indexedRepos = repos.filter(r => r.status === 'indexed');
        setRepositories(indexedRepos);
        
        if (indexedRepos.length > 0) {
          const lastRepoId = localStorage.getItem("last_selected_repo_files");
          if (lastRepoId && indexedRepos.some(r => r.id === lastRepoId)) {
            setSelectedRepoId(lastRepoId);
          } else {
            setSelectedRepoId(indexedRepos[0].id);
          }
        }
      } catch (e) {
        toast.error("Failed to load repositories.");
      } finally {
        setIsLoading(false);
      }
    };
    loadRepos();
  }, []);

  const handleSelectRepo = (id: string) => {
    setSelectedRepoId(id);
    localStorage.setItem("last_selected_repo_files", id);
    setShowRepoDropdown(false);
  };

  const handleDeleteRepo = async () => {
    if (!selectedRepoId) return;
    if (!confirm("Are you sure you want to permanently delete this repository and all its files, embeddings, and chat history?")) return;
    
    try {
      await fetchApi(`/repositories/${selectedRepoId}`, { method: "DELETE" });
      toast.success("Repository deleted.");
      setRepositories(prev => prev.filter(r => r.id !== selectedRepoId));
      localStorage.removeItem("last_selected_repo_files");
      const remaining = repositories.filter(r => r.id !== selectedRepoId);
      setSelectedRepoId(remaining.length > 0 ? remaining[0].id : null);
    } catch (e: any) {
      toast.error(e.message || "Failed to delete repository.");
    }
  };

  const selectedRepo = repositories.find(r => r.id === selectedRepoId);

  return (
    <div className="flex h-screen bg-[#09090B] overflow-hidden">
      <AppSidebar />
      <div className="flex-1 flex flex-col ml-14 overflow-hidden">
        <header className="flex items-center justify-between px-8 h-16 border-b border-[#27272A] bg-[#09090B] flex-shrink-0 z-10 relative">
          <h1 className="text-[16px] font-semibold text-[#FAFAFA] flex items-center gap-2">
            <FolderOpen size={18} className="text-[#A1A1AA]" />
            File Explorer
          </h1>
          
          <div className="flex items-center gap-4">
            {selectedRepo && (
              <>
                <button
                  onClick={handleDeleteRepo}
                  className="px-3 py-1.5 rounded-[8px] bg-red-500/10 text-red-400 text-[12px] font-medium hover:bg-red-500/20 transition-all flex items-center gap-1.5"
                >
                  <Trash2 size={14} />
                  Delete Repository
                </button>

                <div className="relative">
                  <button 
                    onClick={() => setShowRepoDropdown(!showRepoDropdown)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-[8px] border border-[#27272A] bg-[#111113] text-[13px] text-[#FAFAFA] hover:border-[#3f3f46] transition-colors min-w-[200px]"
                  >
                    <Folder size={14} className="text-blue-400" />
                    <span className="flex-1 text-left truncate">{selectedRepo.name}</span>
                    <ChevronDown size={14} className="text-[#52525b]" />
                  </button>
                  
                  {showRepoDropdown && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowRepoDropdown(false)} />
                      <div className="absolute top-full mt-2 right-0 w-[240px] bg-[#111113] border border-[#27272A] rounded-xl overflow-hidden shadow-2xl z-20 max-h-[300px] overflow-y-auto p-1">
                        {repositories.map(repo => (
                          <button
                            key={repo.id}
                            onClick={() => handleSelectRepo(repo.id)}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] text-left transition-colors ${
                              repo.id === selectedRepoId ? "bg-[#27272A] text-[#FAFAFA]" : "text-[#A1A1AA] hover:bg-[#1a1a1d] hover:text-[#FAFAFA]"
                            }`}
                          >
                            <Folder size={14} className={repo.id === selectedRepoId ? "text-blue-400" : "text-[#52525b]"} />
                            <span className="truncate">{repo.name}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-hidden p-8 flex justify-center">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="animate-spin text-[#52525b]" size={24} />
            </div>
          ) : !selectedRepoId ? (
            <div className="flex items-center justify-center h-full text-center text-[#A1A1AA] text-[14px]">
              No indexed repositories available. Upload a repository to explore files.
            </div>
          ) : (
            <div className="w-full max-w-4xl h-full flex flex-col">
               <FileExplorer 
                repositoryId={selectedRepoId} 
                onFileClick={(fileId) => {
                  setViewerSource({ file_id: fileId });
                  setIsViewerOpen(true);
                }} 
              />
            </div>
          )}
        </main>
      </div>

      <SourceViewerModal
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        repositoryId={selectedRepoId || ""}
        fileId={viewerSource?.file_id}
      />
    </div>
  );
}
