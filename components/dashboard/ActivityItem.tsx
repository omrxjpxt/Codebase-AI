import { ActivityItem as ActivityItemType } from "@/lib/mock-data";

interface ActivityItemProps {
  item: ActivityItemType;
}

const dotColors = {
  indexed: "bg-[var(--btn-primary-bg)]",
  refactored: "bg-[var(--secondary-text)]",
  summarized: "bg-[var(--muted-text)]",
  asked: "bg-[var(--secondary-text)]",
};

export default function ActivityItem({ item }: ActivityItemProps) {
  return (
    <div className="flex items-start gap-3 group">
      {/* Dot */}
      <div className="flex flex-col items-center mt-1.5 flex-shrink-0">
        <div className={`w-1.5 h-1.5 rounded-full ${dotColors[item.type]}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-4">
        <p className="text-[13px] text-[var(--primary-text)] leading-snug">{item.text}</p>
        <p className="text-[11px] text-[var(--muted-text)] mt-1 tracking-wide">{item.time}</p>
      </div>
    </div>
  );
}
