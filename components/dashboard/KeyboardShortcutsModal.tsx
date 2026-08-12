"use client";

import { X } from "lucide-react";

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div 
        className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] w-full max-w-[400px] shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-[var(--primary-text)]">Keyboard Shortcuts</h2>
          <button 
            onClick={onClose} 
            className="text-[var(--muted-text)] hover:text-[var(--primary-text)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-[var(--secondary-text)]">Global Search</span>
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded-[4px] bg-[var(--surface-hover)] border border-[var(--border)] text-[11px] text-[var(--primary-text)] font-mono">⌘</kbd>
              <kbd className="px-1.5 py-0.5 rounded-[4px] bg-[var(--surface-hover)] border border-[var(--border)] text-[11px] text-[var(--primary-text)] font-mono">K</kbd>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-[var(--secondary-text)]">Close Modal</span>
            <kbd className="px-1.5 py-0.5 rounded-[4px] bg-[var(--surface-hover)] border border-[var(--border)] text-[11px] text-[var(--primary-text)] font-mono">Esc</kbd>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-[var(--secondary-text)]">Navigate Search Results</span>
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded-[4px] bg-[var(--surface-hover)] border border-[var(--border)] text-[11px] text-[var(--primary-text)] font-mono">↑</kbd>
              <kbd className="px-1.5 py-0.5 rounded-[4px] bg-[var(--surface-hover)] border border-[var(--border)] text-[11px] text-[var(--primary-text)] font-mono">↓</kbd>
            </div>
          </div>
        </div>
        
        <div className="p-4 bg-[var(--background)] border-t border-[var(--border)] rounded-b-[14px]">
          <button 
            onClick={onClose}
            className="w-full py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] rounded-[8px] text-[13px] font-semibold hover:bg-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
