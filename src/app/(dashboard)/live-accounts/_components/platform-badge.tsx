"use client";

interface PlatformBadgeProps {
  platform: string;
  size?: "sm" | "xs";
}

export function PlatformBadge({ platform, size = "sm" }: PlatformBadgeProps) {
  const isDouyin = platform === "抖音";
  const isKuaishou = platform === "快手";

  const baseClass = "inline-flex items-center gap-1 font-medium border rounded-sm";

  const sizeClass =
    size === "xs" ? "text-[10.5px] px-[7px] py-[1px]" : "text-[11px] px-[7px] py-[2px]";

  const colorClass = isDouyin
    ? "text-pink-700 bg-pink-50 border-pink-200"
    : isKuaishou
      ? "text-orange-700 bg-orange-50 border-orange-200"
      : "text-slate-600 bg-slate-50 border-slate-200";

  return <span className={`${baseClass} ${sizeClass} ${colorClass}`}>{platform}</span>;
}
