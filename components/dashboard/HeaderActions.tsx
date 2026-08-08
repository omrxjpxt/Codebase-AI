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
              ? "text-[#FAFAFA] bg-[#1a1a1d] border border-[#27272A]" 
              : "text-[#52525b] hover:text-[#A1A1AA] hover:bg-[#111113] border border-transparent"
          }`}
          aria-label="Notifications"
        >
          <Bell size={16} />
        </button>

        {showNotifications && (
          <div className="absolute right-0 top-full mt-2 w-72 bg-[#111113] border border-[#27272A] rounded-[10px] shadow-2xl z-50 overflow-hidden">
            <div className="p-3 border-b border-[#27272A]">
              <h3 className="text-[13px] font-semibold text-[#FAFAFA]">Notifications</h3>
            </div>
            <div className="p-8 flex flex-col items-center justify-center text-center">
              <Bell size={24} className="text-[#3f3f46] mb-2" />
              <p className="text-[13px] text-[#A1A1AA] font-medium">No notifications yet</p>
              <p className="text-[12px] text-[#52525b] mt-1">When you get updates, they'll show up here.</p>
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
              ? "text-[#FAFAFA] bg-[#1a1a1d] border border-[#27272A]" 
              : "text-[#52525b] hover:text-[#A1A1AA] hover:bg-[#111113] border border-transparent"
          }`}
          aria-label="Help & Resources"
        >
          <HelpCircle size={16} />
        </button>

        {showHelp && (
          <div className="absolute right-0 top-full mt-2 w-56 bg-[#111113] border border-[#27272A] rounded-[10px] shadow-2xl z-50 p-1">
            <Link 
              href="/docs" 
              onClick={() => setShowHelp(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-[#1a1a1d] rounded-[6px] transition-colors"
            >
              <Book size={14} />
              Documentation
            </Link>
            <button 
              onClick={() => {
                setShowHelp(false);
                setShowShortcuts(true);
              }}
              className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-[#1a1a1d] rounded-[6px] transition-colors w-full text-left"
            >
              <Keyboard size={14} />
              Keyboard Shortcuts
            </button>
            <div className="h-px bg-[#27272A] my-1 mx-2" />
            <a 
              href="mailto:support@codebase.ai" 
              onClick={() => setShowHelp(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-[#1a1a1d] rounded-[6px] transition-colors"
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
