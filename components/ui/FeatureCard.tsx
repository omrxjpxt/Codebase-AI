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
        "p-6 rounded-[12px] bg-[#111113] border border-[#27272A] hover:border-[#3f3f46] transition-all group",
        className
      )}
    >
      <div className="w-10 h-10 rounded-[10px] bg-[#1a1a1d] border border-[#27272A] flex items-center justify-center text-[#A1A1AA] mb-4 group-hover:border-[#3f3f46] transition-colors">
        {icons[icon] ?? <GitBranch size={20} />}
      </div>
      <h3 className="text-[15px] font-semibold text-[#FAFAFA] mb-2">{title}</h3>
      <p className="text-[13px] text-[#A1A1AA] leading-relaxed">{description}</p>
    </div>
  );
}
