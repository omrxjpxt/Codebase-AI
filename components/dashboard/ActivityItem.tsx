import { ActivityItem as ActivityItemType } from "@/lib/mock-data";

interface ActivityItemProps {
  item: ActivityItemType;
}

const dotColors = {
  indexed: "bg-[#FAFAFA]",
  refactored: "bg-[#A1A1AA]",
  summarized: "bg-[#52525b]",
  asked: "bg-[#A1A1AA]",
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
        <p className="text-[13px] text-[#FAFAFA] leading-snug">{item.text}</p>
        <p className="text-[11px] text-[#52525b] mt-1 tracking-wide">{item.time}</p>
      </div>
    </div>
  );
}
