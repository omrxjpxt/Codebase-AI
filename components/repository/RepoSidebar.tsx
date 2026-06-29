"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, FolderOpen, GitBranch, Settings } from "lucide-react";
import { Repository } from "@/lib/api";
import { cn } from "@/lib/utils";

interface RepoSidebarProps {
  repo: Repository;
}

const navItems = [
  { icon: MessageSquare, label: "AI Chat", key: "chat" },
  { icon: FolderOpen, label: "Files Explorer", key: "files" },
  { icon: GitBranch, label: "Architecture", key: "architecture" },
  { icon: Settings, label: "Settings", key: "settings" },
];

export default function RepoSidebar({ repo }: RepoSidebarProps) {
  const pathname = usePathname();
  const activeKey = "chat"; // default

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
          const isActive = key === activeKey;
          return (
            <button
              key={key}
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
    </div>
  );
}
