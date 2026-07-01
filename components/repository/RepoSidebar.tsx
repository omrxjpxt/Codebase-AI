"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MessageSquare, FolderOpen, GitBranch, Settings, Plus, X } from "lucide-react";
import { Repository, ChatSession } from "@/lib/api";
import { cn } from "@/lib/utils";

interface RepoSidebarProps {
  repo: Repository;
  chatSessions: ChatSession[];
  activeSessionId: string | null;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onRenameSession: (id: string, newTitle: string) => void;
  onDeleteSession: (id: string) => void;
}

const navItems = [
  { icon: MessageSquare, label: "AI Chat", key: "chat" },
  { icon: FolderOpen, label: "Explorer", key: "files" },
  { icon: GitBranch, label: "Overview", key: "overview" },
];

export default function RepoSidebar({ 
  repo, 
  chatSessions, 
  activeSessionId, 
  activeTab,
  onSelectTab,
  onSelectSession, 
  onNewSession,
  onRenameSession,
  onDeleteSession
}: RepoSidebarProps) {
  const pathname = usePathname();
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");


  return (
    <div className="w-[200px] flex-shrink-0 h-full bg-[#09090B] border-r border-[#27272A] flex flex-col">
      {/* Repo name / branch */}
      <div className="px-4 py-4 border-b border-[#27272A]">
        <div className="flex items-center gap-2 mb-0.5">
          <div className="w-5 h-5 rounded-[4px] bg-[#111113] border border-[#27272A] flex items-center justify-center flex-shrink-0">
            <svg width="9" height="9" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="5" height="5" rx="1" fill="#FAFAFA" />
              <rect x="8" y="1" width="5" height="5" rx="1" fill="#FAFAFA" />
              <rect x="1" y="8" width="5" height="5" rx="1" fill="#FAFAFA" />
              <rect x="8" y="8" width="5" height="5" rx="1" fill="#FAFAFA" />
            </svg>
          </div>
          <span className="text-[13px] font-medium text-[#FAFAFA] truncate leading-tight">
            {repo.name.toLowerCase().replace(/\s+/g, "-")}
          </span>
        </div>
        <p className="text-[11px] text-[#52525b] pl-7">main</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map(({ icon: Icon, label, key }) => {
          const isActive = key === activeTab;
          return (
            <button
              key={key}
              onClick={() => onSelectTab(key)}
              className={cn(
                "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] text-[13px] transition-all text-left",
                isActive
                  ? "bg-[#111113] text-[#FAFAFA] font-medium"
                  : "text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-[#111113]"
              )}
            >
              <Icon size={15} className={isActive ? "text-[#FAFAFA]" : "text-[#52525b]"} />
              {label}
            </button>
          );
        })}
      </nav>
      {/* Recent Chats */}
      <div className="mt-4 px-4 pb-2">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] uppercase tracking-widest text-[#52525b] font-medium">
            Recent Chats
          </p>
          <button 
            onClick={onNewSession}
            className="text-[#52525b] hover:text-[#FAFAFA] transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
        
        <div className="space-y-1 mt-2">
          {chatSessions.length === 0 ? (
            <p className="text-[12px] text-[#52525b] italic">No recent chats.</p>
          ) : (
            chatSessions.map((session) => (
              <div 
                key={session.id}
                className={cn(
                  "group flex items-center justify-between px-2.5 py-1.5 rounded-[6px] text-[12px] cursor-pointer transition-colors",
                  activeSessionId === session.id 
                    ? "bg-[#111113] text-[#FAFAFA] border border-[#27272A]" 
                    : "text-[#A1A1AA] hover:bg-[#111113] hover:text-[#FAFAFA] border border-transparent"
                )}
                onClick={() => onSelectSession(session.id)}
              >
                {editingId === session.id ? (
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={() => {
                      if (editTitle.trim()) onRenameSession(session.id, editTitle);
                      setEditingId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        if (editTitle.trim()) onRenameSession(session.id, editTitle);
                        setEditingId(null);
                      }
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="bg-transparent border-none outline-none w-full text-[#FAFAFA]"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="truncate flex-1">{session.title}</span>
                )}
                
                {!editingId && (
                  <div className="hidden group-hover:flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setEditTitle(session.title); setEditingId(session.id); }}
                      className="text-[#52525b] hover:text-[#FAFAFA]"
                    >
                      <Settings size={12} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id); }}
                      className="text-[#52525b] hover:text-red-400"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
