import { GitBranch, Search, FileCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeatureCardProps {
  icon: string;
  title: string;
  description: string;
  className?: string;
}

const icons: Record<string, React.ReactNode> = {
  GitBranch: <GitBranch size={20} />,
  Search: <Search size={20} />,
  FileCheck: <FileCheck size={20} />,
};

export default function FeatureCard({ icon, title, description, className }: FeatureCardProps) {
  return (
    <div
      className={cn(
        "p-6 rounded-[12px] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border-hover)] transition-all group",
        className
      )}
    >
      <div className="w-10 h-10 rounded-[10px] bg-[var(--surface-hover)] border border-[var(--border)] flex items-center justify-center text-[var(--secondary-text)] mb-4 group-hover:border-[var(--border-hover)] transition-colors">
        {icons[icon] ?? <GitBranch size={20} />}
      </div>
      <h3 className="text-[15px] font-semibold text-[var(--primary-text)] mb-2">{title}</h3>
      <p className="text-[13px] text-[var(--secondary-text)] leading-relaxed">{description}</p>
    </div>
  );
}
