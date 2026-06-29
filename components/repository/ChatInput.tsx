"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { ArrowUp, Plus, AtSign, Hash } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function ChatInput({
  onSend,
  placeholder = "Ask anything about this repository...",
  disabled = false,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (!value.trim() || disabled) return;
    onSend(value.trim());
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
    }
  };

  return (
    <div className="relative">
      <div
        className={cn(
          "flex flex-col rounded-[12px] bg-[#111113] border transition-colors",
          value ? "border-[#3f3f46]" : "border-[#27272A]",
          "focus-within:border-[#52525b]"
        )}
      >
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="w-full bg-transparent px-4 pt-3.5 pb-2 text-[14px] text-[#FAFAFA] placeholder:text-[#52525b] resize-none focus:outline-none leading-relaxed"
        />

        {/* Bottom bar */}
        <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
          <div className="flex items-center gap-1">
            <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[12px] text-[#52525b] hover:text-[#A1A1AA] hover:bg-[#1a1a1d] transition-all">
              <Plus size={12} />
              Add Context
            </button>
            <button className="flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[12px] text-[#52525b] hover:text-[#A1A1AA] hover:bg-[#1a1a1d] transition-all">
              <AtSign size={12} />
              Files
            </button>
            <button className="flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[12px] text-[#52525b] hover:text-[#A1A1AA] hover:bg-[#1a1a1d] transition-all">
              <Hash size={12} />
              Symbols
            </button>
          </div>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!value.trim() || disabled}
            className={cn(
              "w-7 h-7 rounded-[7px] flex items-center justify-center transition-all",
              value.trim()
                ? "bg-[#FAFAFA] text-[#09090B] hover:bg-white cursor-pointer"
                : "bg-[#1a1a1d] text-[#52525b] cursor-not-allowed"
            )}
          >
            <ArrowUp size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
