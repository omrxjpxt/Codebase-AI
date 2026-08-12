"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, HelpCircle, Book, Keyboard, LifeBuoy } from "lucide-react";
import Link from "next/link";
import KeyboardShortcutsModal from "./KeyboardShortcutsModal";

export default function HeaderActions() {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  
  const notifRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (helpRef.current && !helpRef.current.contains(event.target as Node)) {
        setShowHelp(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="flex items-center gap-2 ml-auto relative">
      {/* Notifications */}
      <div className="relative" ref={notifRef}>
        <button 
          onClick={() => {
            setShowNotifications(!showNotifications);
            setShowHelp(false);
          }}
          className={`w-8 h-8 rounded-[8px] flex items-center justify-center transition-all ${
            showNotifications 
              ? "text-[var(--primary-text)] bg-[var(--surface-hover)] border border-[var(--border)]" 
              : "text-[var(--muted-text)] hover:text-[var(--secondary-text)] hover:bg-[var(--surface)] border border-transparent"
          }`}
          aria-label="Notifications"
        >
          <Bell size={16} />
        </button>

        {showNotifications && (
          <div className="absolute right-0 top-full mt-2 w-72 bg-[var(--surface)] border border-[var(--border)] rounded-[10px] shadow-2xl z-50 overflow-hidden">
            <div className="p-3 border-b border-[var(--border)]">
              <h3 className="text-[13px] font-semibold text-[var(--primary-text)]">Notifications</h3>
            </div>
            <div className="p-8 flex flex-col items-center justify-center text-center">
              <Bell size={24} className="text-[var(--placeholder-text)] mb-2" />
              <p className="text-[13px] text-[var(--secondary-text)] font-medium">No notifications yet</p>
              <p className="text-[12px] text-[var(--muted-text)] mt-1">When you get updates, they'll show up here.</p>
            </div>
          </div>
        )}
      </div>

      {/* Help */}
      <div className="relative" ref={helpRef}>
        <button 
          onClick={() => {
            setShowHelp(!showHelp);
            setShowNotifications(false);
          }}
          className={`w-8 h-8 rounded-[8px] flex items-center justify-center transition-all ${
            showHelp 
              ? "text-[var(--primary-text)] bg-[var(--surface-hover)] border border-[var(--border)]" 
              : "text-[var(--muted-text)] hover:text-[var(--secondary-text)] hover:bg-[var(--surface)] border border-transparent"
          }`}
          aria-label="Help & Resources"
        >
          <HelpCircle size={16} />
        </button>

        {showHelp && (
          <div className="absolute right-0 top-full mt-2 w-56 bg-[var(--surface)] border border-[var(--border)] rounded-[10px] shadow-2xl z-50 p-1">
            <Link 
              href="/docs" 
              onClick={() => setShowHelp(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-[var(--secondary-text)] hover:text-[var(--primary-text)] hover:bg-[var(--surface-hover)] rounded-[6px] transition-colors"
            >
              <Book size={14} />
              Documentation
            </Link>
            <button 
              onClick={() => {
                setShowHelp(false);
                setShowShortcuts(true);
              }}
              className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-[var(--secondary-text)] hover:text-[var(--primary-text)] hover:bg-[var(--surface-hover)] rounded-[6px] transition-colors w-full text-left"
            >
              <Keyboard size={14} />
              Keyboard Shortcuts
            </button>
            <div className="h-px bg-[var(--border)] my-1 mx-2" />
            <a 
              href="mailto:support@codebase.ai" 
              onClick={() => setShowHelp(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-[var(--secondary-text)] hover:text-[var(--primary-text)] hover:bg-[var(--surface-hover)] rounded-[6px] transition-colors"
            >
              <LifeBuoy size={14} />
              Support
            </a>
          </div>
        )}
      </div>
      
      <KeyboardShortcutsModal 
        isOpen={showShortcuts} 
        onClose={() => setShowShortcuts(false)} 
      />
    </div>
  );
}
