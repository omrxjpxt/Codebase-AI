"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Command, X, Folder, MessageSquare, Loader2, FileCode, AlignLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { globalSearch, SearchResults } from "@/lib/api";

export default function SearchModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      if (query.trim().length >= 2) {
        performSearch(query);
      }
    }
  }, [isOpen]);

  const performSearch = async (q: string) => {
    if (q.trim().length < 2) {
      setResults(null);
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    try {
      const data = await globalSearch(q);
      setResults(data);
    } catch (error) {
      console.error("Search error:", error);
      setResults(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    if (val.trim().length >= 2) {
      setIsLoading(true);
      timeoutRef.current = setTimeout(() => performSearch(val), 300);
    } else {
      setResults(null);
      setIsLoading(false);
    }
  };

  const hasResults = results && (
    results.repositories.length > 0 || 
    results.files.length > 0 || 
    results.chunks.length > 0 || 
    results.chats.length > 0
  );

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
                onChange={handleInputChange}
                placeholder="Search repositories, files, code, or chats..."
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
                  <p className="text-[13px]">Searching...</p>
                </div>
              ) : query.trim().length < 2 ? (
                <div className="flex flex-col items-center justify-center py-12 text-[#52525b]">
                  <Command size={32} className="mb-3 opacity-20" />
                  <p className="text-[13px]">Type at least 2 characters to search</p>
                </div>
              ) : !hasResults ? (
                <div className="flex flex-col items-center justify-center py-12 text-[#52525b]">
                  <Command size={32} className="mb-3 opacity-20" />
                  <p className="text-[13px]">No results found for "{query}"</p>
                </div>
              ) : (
                <div className="space-y-4 p-2">
                  
                  {/* Repositories */}
                  {results?.repositories.length > 0 && (
                    <div>
                      <div className="px-2 mb-2 text-[11px] font-semibold text-[#52525b] uppercase tracking-widest">
                        Repositories
                      </div>
                      <div className="flex flex-col gap-1">
                        {results.repositories.map(repo => (
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

                  {/* Files */}
                  {results?.files.length > 0 && (
                    <div>
                      <div className="px-2 mb-2 text-[11px] font-semibold text-[#52525b] uppercase tracking-widest">
                        Files
                      </div>
                      <div className="flex flex-col gap-1">
                        {results.files.map(file => (
                          <button
                            key={file.id}
                            onClick={() => {
                              setIsOpen(false);
                              // We could navigate to a file explorer view, for now going to repo
                              router.push(`/repository/${file.repository_id}`);
                            }}
                            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-[8px] hover:bg-[#1a1a1d] transition-colors text-left group"
                          >
                            <FileCode size={16} className="text-[#A1A1AA] group-hover:text-[#FAFAFA] flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] text-[#FAFAFA] font-medium truncate">{file.path.split('/').pop()}</p>
                              <p className="text-[11px] text-[#52525b] truncate">{file.repository_name} • {file.path}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Chunks */}
                  {results?.chunks.length > 0 && (
                    <div>
                      <div className="px-2 mb-2 text-[11px] font-semibold text-[#52525b] uppercase tracking-widest">
                        Code Snippets
                      </div>
                      <div className="flex flex-col gap-1">
                        {results.chunks.map(chunk => (
                          <button
                            key={chunk.id}
                            onClick={() => {
                              setIsOpen(false);
                              router.push(`/repository/${chunk.repository_id}`);
                            }}
                            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-[8px] hover:bg-[#1a1a1d] transition-colors text-left group"
                          >
                            <AlignLeft size={16} className="text-[#A1A1AA] group-hover:text-[#FAFAFA] flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] text-[#A1A1AA] group-hover:text-[#FAFAFA] truncate font-mono bg-[#09090B] px-1 rounded inline-block">
                                {chunk.content_preview}
                              </p>
                              <p className="text-[11px] text-[#52525b] truncate mt-1">{chunk.path} • {chunk.repository_name}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Chats */}
                  {results?.chats.length > 0 && (
                    <div>
                      <div className="px-2 mb-2 text-[11px] font-semibold text-[#52525b] uppercase tracking-widest">
                        Chats
                      </div>
                      <div className="flex flex-col gap-1">
                        {results.chats.map(chat => (
                          <button
                            key={chat.id}
                            onClick={() => {
                              setIsOpen(false);
                              router.push(`/repository/${chat.repository_id}?chat=${chat.id}`);
                            }}
                            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-[8px] hover:bg-[#1a1a1d] transition-colors text-left group"
                          >
                            <MessageSquare size={16} className="text-[#A1A1AA] group-hover:text-[#FAFAFA] flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] text-[#FAFAFA] font-medium truncate">{chat.title}</p>
                              <p className="text-[11px] text-[#52525b] truncate">{chat.repository_name}</p>
                            </div>
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
