import Link from "next/link";
import { FolderOpen, Circle } from "lucide-react";
import { Repository } from "@/lib/api";
import { cn } from "@/lib/utils";

interface RepositoryCardProps {
  repo: Repository;
}

const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
  indexed: { label: "Indexed", color: "text-emerald-400", dot: "bg-emerald-400" },
  embedding: { label: "Embedding", color: "text-blue-400", dot: "bg-blue-400" },
  processing: { label: "Processing", color: "text-amber-400", dot: "bg-amber-400" },
  failed: { label: "Failed", color: "text-red-400", dot: "bg-red-400" },
};

export default function RepositoryCard({ repo }: RepositoryCardProps) {
  const status = statusConfig[repo.status] || { label: repo.status, color: "text-gray-400", dot: "bg-gray-400" };

  // Calculate generic date display or specific format
  const dateStr = new Date(repo.upload_date).toLocaleDateString();

  return (
    <Link href={`/repository/${repo.id}`}>
      <div className="flex items-center gap-4 px-4 py-3.5 rounded-[10px] hover:bg-[var(--surface)] transition-all group cursor-pointer border border-transparent hover:border-[var(--border)]">
        {/* Icon */}
        <div className="w-9 h-9 rounded-[8px] bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center flex-shrink-0 group-hover:border-[var(--border-hover)] transition-colors">
          <FolderOpen size={16} className="text-[var(--muted-text)]" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-medium text-[var(--primary-text)] truncate">{repo.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[12px] text-[var(--secondary-text)]">
              {dateStr}
            </span>
            {repo.file_count !== undefined && (
              <>
                <span className="text-[var(--placeholder-text)]">•</span>
                <span className="text-[12px] text-[var(--secondary-text)]">
                  {repo.file_count} files
                </span>
              </>
            )}
            <span className="text-[var(--placeholder-text)]">•</span>
            <span className={cn("text-[12px] flex items-center gap-1", status.color)}>
              <span className={cn("w-1.5 h-1.5 rounded-full inline-block", status.dot)} />
              {status.label}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
