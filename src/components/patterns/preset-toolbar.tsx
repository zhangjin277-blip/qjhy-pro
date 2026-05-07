/**
 * PresetChip / PresetToolbar · 业务页面配方
 *
 * 数据看板的「预设/筛选 chip」统一实现。所有同款 chip（主播明细预设、投放产品筛选、
 * 视图模式切换、未来日/周/月切换 等）必须用 PresetChip。
 *
 * 视觉规范：
 * - chip: rounded-full border px-2.5 py-0.5 text-xs transition-colors
 * - active: bg-primary text-primary-foreground border-primary
 * - inactive: border-border text-muted-foreground hover:border-primary/50 hover:text-foreground
 * - toolbar: flex flex-wrap items-center gap-1.5 + 「预设:」label
 *
 * 用法：
 *   <PresetToolbar label="预设:">
 *     <PresetChip active onClick={...}>捕鱼<PresetChipCount active>84</PresetChipCount></PresetChip>
 *     <PresetChip onClick={...}>UE4<PresetChipCount>33</PresetChipCount></PresetChip>
 *     <PresetToolbar.Divider />
 *     <PresetChip>主播汇总</PresetChip>
 *   </PresetToolbar>
 */
import { cn } from "@/lib/utils/cn";

interface PresetChipProps {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

export function PresetChip({ active, onClick, children, className }: PresetChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Chip 内的小数字徽章。Count 自身不知道父 Chip 是否 active，需要用方调用方传 active prop。
 */
export function PresetChipCount({
  active,
  children,
}: {
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded px-1 text-[10px]",
        active ? "bg-white/20 text-primary-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

interface PresetToolbarProps {
  /** 左侧 label 文字，默认「预设:」。传 null 隐藏 */
  label?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function PresetToolbar({ label = "预设:", children, className }: PresetToolbarProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {label != null && <span className="text-muted-foreground mr-1 text-xs">{label}</span>}
      {children}
    </div>
  );
}

PresetToolbar.Divider = function Divider() {
  return <span className="text-muted-foreground/40 mx-1 text-xs">|</span>;
};
