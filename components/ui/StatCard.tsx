interface StatCardProps {
  value: string;
  label: string;
}

export default function StatCard({ value, label }: StatCardProps) {
  return (
    <div className="text-center">
      <p className="text-[40px] md:text-[52px] font-bold text-[#FAFAFA] tracking-tight leading-none">
        {value}
      </p>
      <p className="text-[14px] text-[#A1A1AA] mt-2 tracking-wide uppercase text-[12px]">
        {label}
      </p>
    </div>
  );
}
