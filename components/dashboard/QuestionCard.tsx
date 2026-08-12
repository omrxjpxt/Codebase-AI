"use client";

import { MessageSquare } from "lucide-react";

interface QuestionCardProps {
  question: {
    title: string;
    time: string;
  };
}

export default function QuestionCard({ question }: QuestionCardProps) {
  return (
    <div className="flex flex-col gap-2.5 p-4 rounded-[10px] bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)] hover:border-[var(--border-hover)] transition-all cursor-pointer group">
      <div className="w-7 h-7 rounded-[6px] bg-[var(--surface-hover)] border border-[var(--border)] flex items-center justify-center group-hover:bg-[var(--border)] transition-colors">
        <MessageSquare size={13} className="text-[var(--secondary-text)] group-hover:text-[var(--primary-text)]" />
      </div>
      <div>
        <p className="text-[13px] font-medium text-[var(--primary-text)] leading-snug line-clamp-2 mb-1">
          {question.title}
        </p>
        <span className="text-[11px] text-[var(--muted-text)]">
          {question.time}
        </span>
      </div>
    </div>
  );
}
