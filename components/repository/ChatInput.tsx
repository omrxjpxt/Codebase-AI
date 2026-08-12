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
          "flex flex-col rounded-[12px] bg-[var(--surface)] border transition-colors",
          value ? "border-[var(--border-hover)]" : "border-[var(--border)]",
          "focus-within:border-[var(--input-focus-border)]"
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
          className="w-full bg-transparent px-4 pt-3.5 pb-2 text-[14px] text-[var(--primary-text)] placeholder:text-[var(--muted-text)] resize-none focus:outline-none leading-relaxed"
        />

        {/* Bottom bar */}
        <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
          <div className="flex items-center gap-1">
            <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[12px] text-[var(--muted-text)] hover:text-[var(--secondary-text)] hover:bg-[var(--surface-hover)] transition-all">
              <Plus size={12} />
              Add Context
            </button>
            <button className="flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[12px] text-[var(--muted-text)] hover:text-[var(--secondary-text)] hover:bg-[var(--surface-hover)] transition-all">
              <AtSign size={12} />
              Files
            </button>
            <button className="flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[12px] text-[var(--muted-text)] hover:text-[var(--secondary-text)] hover:bg-[var(--surface-hover)] transition-all">
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
                ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-white cursor-pointer"
                : "bg-[var(--surface-hover)] text-[var(--muted-text)] cursor-not-allowed"
            )}
          >
            <ArrowUp size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
