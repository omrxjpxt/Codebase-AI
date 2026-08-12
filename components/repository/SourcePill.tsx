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
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border-hover)] transition-all text-[12px] font-mono group",
        className
      )}
    >
      <File
        size={12}
        className={cn(
          "flex-shrink-0",
          source.language ? langColors[source.language] ?? "text-[var(--muted-text)]" : "text-[var(--muted-text)]"
        )}
    />
    <span className="text-[var(--secondary-text)] group-hover:text-[var(--primary-text)] transition-colors">
      {source.file || source.name}
    </span>
    {source.score !== undefined && (
      <span className="text-[10px] text-[var(--muted-text)] ml-1 bg-[#18181b] px-1.5 py-0.5 rounded-[4px]">
        {(source.score * 100).toFixed(1)}%
      </span>
    )}
  </button>
  );
}
