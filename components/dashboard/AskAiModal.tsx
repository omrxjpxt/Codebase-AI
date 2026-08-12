"use client";

import { X, Folder, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { Repository } from "@/lib/api";

interface AskAiModalProps {
  isOpen: boolean;
  onClose: () => void;
  repositories: Repository[];
  onUploadClick: () => void;
}

export default function AskAiModal({ isOpen, onClose, repositories, onUploadClick }: AskAiModalProps) {
  const router = useRouter();

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div 
        className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] w-full max-w-[480px] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-[var(--secondary-text)]" />
            <h2 className="text-[16px] font-semibold text-[var(--primary-text)]">Ask AI</h2>
          </div>
          <button 
            onClick={onClose} 
            className="text-[var(--muted-text)] hover:text-[var(--primary-text)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6">
          <p className="text-[13px] text-[var(--secondary-text)] mb-4">
            Select a repository to start a new chat session and ask questions about its codebase.
          </p>

          {repositories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center bg-[var(--background)] border border-[var(--border)] rounded-[10px]">
              <Folder size={24} className="text-[var(--muted-text)] mb-2" />
              <p className="text-[13px] font-medium text-[var(--primary-text)] mb-1">No repositories available</p>
              <p className="text-[12px] text-[var(--muted-text)] mb-4">You need to upload a repository first.</p>
              <button 
                onClick={() => {
                  onClose();
                  onUploadClick();
                }}
                className="px-4 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] rounded-[8px] text-[13px] font-semibold hover:bg-white transition-colors"
              >
                Upload Repository
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto">
              {repositories.map(repo => (
                <button
                  key={repo.id}
                  onClick={() => {
                    onClose();
                    router.push(`/repository/${repo.id}`);
                  }}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-[10px] bg-[var(--background)] border border-[var(--border)] hover:border-[var(--border-hover)] hover:bg-[var(--surface-hover)] transition-all text-left group"
                >
                  <Folder size={16} className="text-[var(--muted-text)] group-hover:text-[var(--primary-text)]" />
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] text-[var(--secondary-text)] group-hover:text-[var(--primary-text)] font-medium block truncate">
                      {repo.name}
                    </span>
                    <span className="text-[11px] text-[var(--muted-text)] truncate mt-0.5 block">
                      {repo.status === "indexed" ? "Ready for chat" : "Indexing in progress..."}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
