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
    <div className="flex flex-col gap-2.5 p-4 rounded-[10px] bg-[#111113] border border-[#27272A] hover:bg-[#1a1a1d] hover:border-[#3f3f46] transition-all cursor-pointer group">
      <div className="w-7 h-7 rounded-[6px] bg-[#1a1a1d] border border-[#27272A] flex items-center justify-center group-hover:bg-[#27272A] transition-colors">
        <MessageSquare size={13} className="text-[#A1A1AA] group-hover:text-[#FAFAFA]" />
      </div>
      <div>
        <p className="text-[13px] font-medium text-[#FAFAFA] leading-snug line-clamp-2 mb-1">
          {question.title}
        </p>
        <span className="text-[11px] text-[#52525b]">
          {question.time}
        </span>
      </div>
    </div>
  );
}
