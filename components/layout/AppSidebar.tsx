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
    <div className="fixed left-0 top-0 bottom-0 w-14 bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)] flex flex-col items-center py-4 z-40">
      {/* Logo */}
      <Link href="/dashboard" className="mb-8 mt-1">
        <div className="w-8 h-8 bg-[var(--sidebar-logo-bg)] rounded-[8px] flex items-center justify-center hover:opacity-90 transition-opacity">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="5" height="5" rx="1" fill="var(--sidebar-logo-fill)" />
            <rect x="8" y="1" width="5" height="5" rx="1" fill="var(--sidebar-logo-fill)" />
            <rect x="1" y="8" width="5" height="5" rx="1" fill="var(--sidebar-logo-fill)" />
            <rect x="8" y="8" width="5" height="5" rx="1" fill="var(--sidebar-logo-fill)" />
          </svg>
        </div>
      </Link>

      {/* Nav items */}
      <div className="flex flex-col gap-1 flex-1">
        {navItems.map(({ icon: Icon, href, label }) => {
          const isActive = href === "/dashboard" 
            ? pathname === "/dashboard"
            : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={cn(
                "w-9 h-9 rounded-[8px] flex items-center justify-center transition-all",
                isActive
                  ? "bg-[var(--sidebar-active)] text-[var(--sidebar-icon-active)]"
                  : "text-[var(--sidebar-icon)] hover:text-[var(--sidebar-icon-hover)] hover:bg-[var(--sidebar-hover)]"
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
          href="/settings"
          title="Settings"
          className={cn(
            "w-9 h-9 rounded-[8px] flex items-center justify-center transition-all",
            pathname === "/settings"
              ? "bg-[var(--sidebar-active)] text-[var(--sidebar-icon-active)]"
              : "text-[var(--sidebar-icon)] hover:text-[var(--sidebar-icon-hover)] hover:bg-[var(--sidebar-hover)]"
          )}
        >
          <Settings size={18} />
        </Link>
        <div className="w-7 h-7 rounded-full bg-[var(--sidebar-avatar-bg)] border border-[var(--sidebar-avatar-border)] flex items-center justify-center text-[11px] font-medium text-[var(--sidebar-avatar-text)] cursor-pointer hover:border-[var(--sidebar-icon)] transition-colors">
          O
        </div>
      </div>
    </div>
  );
}
