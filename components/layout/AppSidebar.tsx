"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  MessageSquare,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: LayoutDashboard, href: "/dashboard", label: "Dashboard" },
  { icon: FolderOpen, href: "/dashboard/files", label: "Files" },
  { icon: MessageSquare, href: "/dashboard/chats", label: "Chats" },
];

export default function AppSidebar() {
  const pathname = usePathname();

  return (
    <div className="fixed left-0 top-0 bottom-0 w-14 bg-[#09090B] border-r border-[#27272A] flex flex-col items-center py-4 z-40">
      {/* Logo */}
      <Link href="/dashboard" className="mb-8 mt-1">
        <div className="w-8 h-8 bg-[#111113] border border-[#27272A] rounded-[8px] flex items-center justify-center hover:border-[#3f3f46] transition-colors">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="5" height="5" rx="1" fill="#FAFAFA" />
            <rect x="8" y="1" width="5" height="5" rx="1" fill="#FAFAFA" />
            <rect x="1" y="8" width="5" height="5" rx="1" fill="#FAFAFA" />
            <rect x="8" y="8" width="5" height="5" rx="1" fill="#FAFAFA" />
          </svg>
        </div>
      </Link>

      {/* Nav items */}
      <div className="flex flex-col gap-1 flex-1">
        {navItems.map(({ icon: Icon, href, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={cn(
                "w-9 h-9 rounded-[8px] flex items-center justify-center transition-all",
                isActive
                  ? "bg-[#1a1a1d] text-[#FAFAFA]"
                  : "text-[#52525b] hover:text-[#A1A1AA] hover:bg-[#111113]"
              )}
            >
              <Icon size={18} />
            </Link>
          );
        })}
      </div>

      {/* Bottom: settings + avatar */}
      <div className="flex flex-col items-center gap-3">
        <Link
          href="/dashboard/settings"
          title="Settings"
          className="w-9 h-9 rounded-[8px] flex items-center justify-center text-[#52525b] hover:text-[#A1A1AA] hover:bg-[#111113] transition-all"
        >
          <Settings size={18} />
        </Link>
        <div className="w-7 h-7 rounded-full bg-[#27272A] border border-[#3f3f46] flex items-center justify-center text-[11px] font-medium text-[#A1A1AA] cursor-pointer hover:border-[#52525b] transition-colors">
          O
        </div>
      </div>
    </div>
  );
}
