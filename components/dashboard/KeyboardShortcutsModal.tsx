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
        className="bg-[#111113] border border-[#27272A] rounded-[14px] w-full max-w-[400px] shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-[#27272A] flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-[#FAFAFA]">Keyboard Shortcuts</h2>
          <button 
            onClick={onClose} 
            className="text-[#52525b] hover:text-[#FAFAFA] transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-[#A1A1AA]">Global Search</span>
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded-[4px] bg-[#1a1a1d] border border-[#27272A] text-[11px] text-[#FAFAFA] font-mono">⌘</kbd>
              <kbd className="px-1.5 py-0.5 rounded-[4px] bg-[#1a1a1d] border border-[#27272A] text-[11px] text-[#FAFAFA] font-mono">K</kbd>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-[#A1A1AA]">Close Modal</span>
            <kbd className="px-1.5 py-0.5 rounded-[4px] bg-[#1a1a1d] border border-[#27272A] text-[11px] text-[#FAFAFA] font-mono">Esc</kbd>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-[#A1A1AA]">Navigate Search Results</span>
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded-[4px] bg-[#1a1a1d] border border-[#27272A] text-[11px] text-[#FAFAFA] font-mono">↑</kbd>
              <kbd className="px-1.5 py-0.5 rounded-[4px] bg-[#1a1a1d] border border-[#27272A] text-[11px] text-[#FAFAFA] font-mono">↓</kbd>
            </div>
          </div>
        </div>
        
        <div className="p-4 bg-[#09090B] border-t border-[#27272A] rounded-b-[14px]">
          <button 
            onClick={onClose}
            className="w-full py-2 bg-[#FAFAFA] text-[#09090B] rounded-[8px] text-[13px] font-semibold hover:bg-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
