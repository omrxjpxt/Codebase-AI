"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Command, X, Folder, MessageSquare, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { fetchApi, Repository } from "@/lib/api";

interface ChatSession {
  id: string;
  title: string;
  repository_id: string;
}

export default function SearchModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [chats, setChats] = useState<ChatSession[]>([]);
  
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle keyboard shortcut (CMD+K or Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (isOpen && e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Fetch data when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setIsLoading(true);
      Promise.all([
        fetchApi("/repositories").catch(() => []),
        fetchApi("/chat-sessions").catch(() => [])
      ])
        .then(([reposData, chatsData]) => {
          setRepositories(reposData || []);
          setChats(chatsData || []);
        })
        .finally(() => {
          setIsLoading(false);
          // Focus input on next tick
          setTimeout(() => inputRef.current?.focus(), 50);
        });
    }
  }, [isOpen]);

  // Filter results
  const lowerQuery = query.toLowerCase();
  const filteredRepos = repositories.filter(r => r.name.toLowerCase().includes(lowerQuery));
  const filteredChats = chats.filter(c => c.title.toLowerCase().includes(lowerQuery));

  const hasResults = filteredRepos.length > 0 || filteredChats.length > 0;

  return (
    <>
      {/* Trigger Button */}
      <div className="flex-1 max-w-lg">
        <button 
          onClick={() => setIsOpen(true)}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[8px] bg-[#111113] border border-[#27272A] hover:border-[#3f3f46] transition-colors text-left group"
        >
          <Search size={14} className="text-[#52525b]" />
          <span className="text-[13px] text-[#52525b] flex-1">
            Search repositories, files, functions, or chats...
          </span>
          <div className="flex items-center gap-1 flex-shrink-0">
            <kbd className="px-1.5 py-0.5 rounded-[4px] bg-[#1a1a1d] border border-[#27272A] text-[10px] text-[#52525b] font-mono">⌘</kbd>
            <kbd className="px-1.5 py-0.5 rounded-[4px] bg-[#1a1a1d] border border-[#27272A] text-[10px] text-[#52525b] font-mono">K</kbd>
          </div>
        </button>
      </div>

      {/* Modal Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setIsOpen(false)}
        >
          {/* Modal Content */}
          <div 
            className="bg-[#111113] border border-[#27272A] rounded-[14px] w-full max-w-[600px] overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* Search Input */}
            <div className="flex items-center gap-3 px-4 py-4 border-b border-[#27272A]">
              <Search size={18} className="text-[#52525b]" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search repositories or chats..."
                className="flex-1 bg-transparent border-none text-[15px] text-[#FAFAFA] placeholder:text-[#52525b] focus:outline-none"
              />
              <button 
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-[6px] text-[#52525b] hover:text-[#FAFAFA] hover:bg-[#27272A] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Results Area */}
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-[#52525b]">
                  <Loader2 size={24} className="animate-spin mb-3" />
                  <p className="text-[13px]">Loading workspace...</p>
                </div>
              ) : !hasResults ? (
                <div className="flex flex-col items-center justify-center py-12 text-[#52525b]">
                  <Command size={32} className="mb-3 opacity-20" />
                  <p className="text-[13px]">No results found for "{query}"</p>
                  <p className="text-[12px] mt-1 opacity-70">Note: Global file search requires a backend index update.</p>
                </div>
              ) : (
                <div className="space-y-4 p-2">
                  
                  {/* Repositories */}
                  {filteredRepos.length > 0 && (
                    <div>
                      <div className="px-2 mb-2 text-[11px] font-semibold text-[#52525b] uppercase tracking-widest">
                        Repositories
                      </div>
                      <div className="flex flex-col gap-1">
                        {filteredRepos.map(repo => (
                          <button
                            key={repo.id}
                            onClick={() => {
                              setIsOpen(false);
                              router.push(`/repository/${repo.id}`);
                            }}
                            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-[8px] hover:bg-[#1a1a1d] transition-colors text-left group"
                          >
                            <Folder size={16} className="text-[#A1A1AA] group-hover:text-[#FAFAFA]" />
                            <span className="text-[13px] text-[#A1A1AA] group-hover:text-[#FAFAFA] font-medium flex-1 truncate">
                              {repo.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Chats */}
                  {filteredChats.length > 0 && (
                    <div>
                      <div className="px-2 mb-2 text-[11px] font-semibold text-[#52525b] uppercase tracking-widest">
                        Chats
                      </div>
                      <div className="flex flex-col gap-1">
                        {filteredChats.map(chat => (
                          <button
                            key={chat.id}
                            onClick={() => {
                              setIsOpen(false);
                              router.push(`/repository/${chat.repository_id}?chat=${chat.id}`);
                            }}
                            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-[8px] hover:bg-[#1a1a1d] transition-colors text-left group"
                          >
                            <MessageSquare size={16} className="text-[#A1A1AA] group-hover:text-[#FAFAFA]" />
                            <span className="text-[13px] text-[#A1A1AA] group-hover:text-[#FAFAFA] font-medium flex-1 truncate">
                              {chat.title}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="px-4 py-3 border-t border-[#27272A] flex items-center justify-between text-[11px] text-[#52525b] bg-[#09090B]">
              <div className="flex items-center gap-2">
                <span><kbd className="px-1 py-0.5 rounded bg-[#1a1a1d] border border-[#27272A]">↑</kbd> <kbd className="px-1 py-0.5 rounded bg-[#1a1a1d] border border-[#27272A]">↓</kbd> to navigate</span>
                <span><kbd className="px-1 py-0.5 rounded bg-[#1a1a1d] border border-[#27272A]">↵</kbd> to select</span>
              </div>
              <div>esc to close</div>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
