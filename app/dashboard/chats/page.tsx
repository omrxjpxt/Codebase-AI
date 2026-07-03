"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppSidebar from "@/components/layout/AppSidebar";
import { fetchApi, ChatSessionWithRepo, getAllChatSessions, deleteChatSession } from "@/lib/api";
import { MessageSquare, Folder, Trash2, ArrowRight, Loader2, Search, Edit2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export default function ChatsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<ChatSessionWithRepo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const loadData = async () => {
    try {
      const data = await getAllChatSessions();
      setSessions(data);
    } catch (e) {
      toast.error("Failed to load chat sessions.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this chat session?")) return;
    try {
      await deleteChatSession(id);
      toast.success("Chat deleted.");
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch (e: any) {
      toast.error(e.message || "Failed to delete chat.");
    }
  };

  const handleRename = async (e: React.MouseEvent | React.KeyboardEvent, id: string, newTitle: string) => {
    if (e.type === 'click') {
        e.preventDefault();
        e.stopPropagation();
    }
    if (!newTitle.trim()) {
      setEditingId(null);
      return;
    }
    try {
      await fetchApi(`/repositories/chat-sessions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: newTitle })
      });
      setSessions(prev => prev.map(s => s.id === id ? { ...s, title: newTitle } : s));
      setEditingId(null);
      toast.success("Chat renamed.");
    } catch (e: any) {
      toast.error(e.message || "Failed to rename chat.");
      setEditingId(null);
    }
  };

  const filteredSessions = sessions.filter(s => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.repository_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.last_message_preview && s.last_message_preview.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="flex h-screen bg-[#09090B] overflow-hidden">
      <AppSidebar />
      <div className="flex-1 flex flex-col ml-14 overflow-hidden">
        <header className="flex items-center justify-between px-8 h-16 border-b border-[#27272A] bg-[#09090B] flex-shrink-0">
          <h1 className="text-[16px] font-semibold text-[#FAFAFA] flex items-center gap-2">
            <MessageSquare size={18} className="text-[#A1A1AA]" />
            All Chats
          </h1>
          <div className="relative w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#52525b]" />
            <input 
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#111113] border border-[#27272A] rounded-lg py-1.5 pl-9 pr-3 text-[13px] text-[#FAFAFA] focus:outline-none focus:border-[#52525b] transition-colors"
            />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-8 py-8">
          <div className="max-w-4xl mx-auto space-y-4">
            {isLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="animate-spin text-[#52525b]" size={24} />
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="text-center py-20 text-[#A1A1AA] text-[14px]">
                {searchQuery ? "No chats match your search." : "No chat sessions found."}
              </div>
            ) : (
              filteredSessions.map((session) => (
                <Link
                  href={`/repository/${session.repository_id}?chat=${session.id}`}
                  key={session.id}
                  className="block bg-[#111113] border border-[#27272A] rounded-xl p-5 hover:border-[#3f3f46] transition-colors group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Folder size={14} className="text-blue-400" />
                        <span className="text-[12px] font-medium text-[#A1A1AA]">{session.repository_name}</span>
                        <span className="text-[#3f3f46] text-[12px]">•</span>
                        <span className="text-[12px] text-[#52525b]">
                          {new Date(session.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      
                      {editingId === session.id ? (
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onBlur={(e) => handleRename(e as any, session.id, editTitle)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRename(e, session.id, editTitle);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="bg-transparent border-b border-[#52525b] outline-none text-[#FAFAFA] text-[15px] font-medium w-full pb-1 mb-2"
                          autoFocus
                          onClick={(e) => e.preventDefault()}
                        />
                      ) : (
                        <h3 className="text-[15px] font-medium text-[#FAFAFA] truncate mb-2">{session.title}</h3>
                      )}
                      
                      <p className="text-[13px] text-[#A1A1AA] line-clamp-2 leading-relaxed">
                        {session.last_message_preview || <span className="italic">Empty chat</span>}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      {!editingId && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            setEditTitle(session.title);
                            setEditingId(session.id);
                          }}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#52525b] hover:text-[#FAFAFA] hover:bg-[#27272A] transition-colors"
                          title="Rename Chat"
                        >
                          <Edit2 size={14} />
                        </button>
                      )}
                      <button
                        onClick={(e) => handleDelete(e, session.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-[#52525b] hover:text-red-400 hover:bg-red-400/10 transition-colors"
                        title="Delete Chat"
                      >
                        <Trash2 size={14} />
                      </button>
                      <div className="w-8 h-8 flex items-center justify-center rounded-lg text-[#52525b] group-hover:text-[#FAFAFA] transition-colors">
                        <ArrowRight size={16} />
                      </div>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
