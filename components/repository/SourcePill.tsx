"use client";

import { File } from "lucide-react";
import { SourceFile } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

interface SourcePillProps {
  source: SourceFile;
  onClick?: (source: SourceFile) => void;
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
          langColors[source.language] ?? "text-[#52525b]"
        )}
      />
      <span className="text-[#A1A1AA] group-hover:text-[#FAFAFA] transition-colors">
        {source.name}
      </span>
    </button>
  );
}
