"use client";

import { useEffect, useState, ReactNode } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { Search, Folder, MessageSquare, Settings, ArrowRight } from "lucide-react";
import { fetchApi } from "@/lib/api";

export default function GlobalSearch({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [repos, setRepos] = useState<any[]>([]);
  const router = useRouter();

  // Toggle the menu when ⌘K is pressed
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Fetch repos when opened
  useEffect(() => {
    if (open && repos.length === 0) {
      fetchApi("/repositories").then(setRepos).catch(console.error);
    }
  }, [open, repos.length]);

  return (
    <>
      {children}
      <Command.Dialog 
        open={open} 
        onOpenChange={setOpen} 
        label="Global Command Menu"
        className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm px-4 cmdk-dialog"
      >
        <div className="w-full max-w-[600px] bg-[#111113] border border-[#27272A] rounded-xl shadow-2xl overflow-hidden flex flex-col cmdk-content">
          <div className="flex items-center px-4 border-b border-[#27272A]">
            <Search size={16} className="text-[#A1A1AA] mr-3" />
            <Command.Input 
              placeholder="Search repositories, open settings..." 
              className="flex-1 bg-transparent py-4 outline-none text-[#FAFAFA] placeholder:text-[#52525b] text-[15px]" 
            />
          </div>
          <Command.List className="max-h-[300px] overflow-y-auto p-2 cmdk-list">
            <Command.Empty className="py-6 text-center text-[13px] text-[#A1A1AA]">No results found.</Command.Empty>

            <Command.Group heading="Repositories" className="text-[11px] text-[#52525b] font-medium px-2 py-1.5 uppercase tracking-wider">
              {repos.map(repo => (
                <Command.Item 
                  key={repo.id}
                  onSelect={() => {
                    setOpen(false);
                    router.push(`/repository/${repo.id}`);
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-[14px] text-[#FAFAFA] aria-selected:bg-[#27272A] aria-selected:text-white transition-colors"
                >
                  <Folder size={16} className="text-blue-400" />
                  <span className="flex-1 truncate">{repo.name}</span>
                  <ArrowRight size={14} className="text-[#52525b]" />
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Separator className="h-px bg-[#27272A] my-1" />

            <Command.Group heading="Quick Links" className="text-[11px] text-[#52525b] font-medium px-2 py-1.5 uppercase tracking-wider">
              <Command.Item 
                onSelect={() => { setOpen(false); router.push("/dashboard"); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-[14px] text-[#FAFAFA] aria-selected:bg-[#27272A] aria-selected:text-white transition-colors"
              >
                <Folder size={16} className="text-[#A1A1AA]" />
                <span>Dashboard</span>
              </Command.Item>
              <Command.Item 
                onSelect={() => { setOpen(false); router.push("/settings"); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-[14px] text-[#FAFAFA] aria-selected:bg-[#27272A] aria-selected:text-white transition-colors"
              >
                <Settings size={16} className="text-[#A1A1AA]" />
                <span>Settings</span>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </div>
      </Command.Dialog>
      
      {/* We inject cmdk-specific global styles here so they only apply when using Command component */}
      <style jsx global>{`
        [cmdk-dialog] {
          outline: none;
        }
        [cmdk-list] {
          outline: none;
        }
        [cmdk-group-heading] {
          padding: 8px 12px 4px;
          color: #52525b;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        [cmdk-item][aria-selected="true"] {
          background: #27272A;
          color: #FAFAFA;
        }
      `}</style>
    </>
  );
}
