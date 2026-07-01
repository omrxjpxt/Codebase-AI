"use client";

import { File } from "lucide-react";
import { cn } from "@/lib/utils";

interface SourcePillProps {
  source: any;
  onClick?: (source: any) => void;
  className?: string;
}

const langColors: Record<string, string> = {
  Python: "text-blue-400",
  TypeScript: "text-cyan-400",
  JavaScript: "text-yellow-400",
  Go: "text-sky-400",
  Rust: "text-orange-400",
};

export default function SourcePill({ source, onClick, className }: SourcePillProps) {
  return (
    <button
      onClick={() => onClick?.(source)}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-[#111113] border border-[#27272A] hover:border-[#3f3f46] transition-all text-[12px] font-mono group",
        className
      )}
    >
      <File
        size={12}
        className={cn(
          "flex-shrink-0",
          source.language ? langColors[source.language] ?? "text-[#52525b]" : "text-[#52525b]"
        )}
    />
    <span className="text-[#A1A1AA] group-hover:text-[#FAFAFA] transition-colors">
      {source.file || source.name}
    </span>
    {source.score !== undefined && (
      <span className="text-[10px] text-[#52525b] ml-1 bg-[#18181b] px-1.5 py-0.5 rounded-[4px]">
        {(source.score * 100).toFixed(1)}%
      </span>
    )}
  </button>
  );
}
