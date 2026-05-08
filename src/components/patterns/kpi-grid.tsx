/**
 * KpiGrid · 业务页面配方
 *
 * 数据看板 KPI 卡片网格的统一实现。所有数据板块（主播明细 / 投放数据 / 直播数据 / ...）
 * 必须用 KpiGrid，不允许自己写 grid + 卡片 className。
 *
 * 视觉规范：
 * - 卡片: rounded-lg border border-border bg-card px-4 py-3
 * - label: text-xs text-muted-foreground
 * - value: .kpi-value (32px / 700)
 * - footer: text-xs text-muted-foreground
 * - grid: 2 / 3 / 4 或 6 列响应式（按 items 数量自动）
 *
 * API 设计：
 * - items 配置式而不是 children，避免开发者自由发挥破坏一致性
 * - label/value/footer 是 ReactNode，内容自由（数字格式化在调用方决定）
 * - footer 用于「↑ 12.4% 较前期」这类同比/补充信息
 * - onRemove 可选，用于支持「× 移除 KPI」
 */
import { cn } from "@/lib/utils/cn";

export interface KpiItem {
  /** React 列表 key，业务侧给个稳定 id */
  key: string;
  /** 标题，例：「消耗」「激活数」「总音浪」 */
  label: React.ReactNode;
  /** 主数值，已格式化好（"20.64万"、"¥3.42万"、"32%"），KpiGrid 不格式化 */
  value: React.ReactNode;
  /** 副信息行，例：「↑ 12.4% 较前期」「CPA ¥449」「行业均值 0.42」 */
  footer?: React.ReactNode;
  /** 可选移除回调（KPI 自定义场景，如主播明细 KPI 可移除） */
  onRemove?: () => void;
}

export interface KpiGridProps {
  items: KpiItem[];
  /** 选中的卡片 key（点击切换趋势图等场景） */
  activeKey?: string | null;
  /** 卡片点击回调；提供后卡片变成可交互（cursor + ring） */
  onSelect?: (key: string) => void;
}

export function KpiGrid({ items, activeKey = null, onSelect }: KpiGridProps) {
  if (items.length === 0) return null;

  // 列数自适应：≤4 个用 4 列，5+ 用 6 列
  const lgCols = items.length <= 4 ? "lg:grid-cols-4" : "lg:grid-cols-6";

  return (
    <div className={cn("grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3", lgCols)}>
      {items.map((it) => (
        <KpiCard key={it.key} item={it} active={activeKey === it.key} onSelect={onSelect} />
      ))}
    </div>
  );
}

function KpiCard({
  item,
  active,
  onSelect,
}: {
  item: KpiItem;
  active: boolean;
  onSelect?: (key: string) => void;
}) {
  const interactive = !!onSelect;
  return (
    <div
      onClick={interactive ? () => onSelect?.(item.key) : undefined}
      className={cn(
        "group bg-card relative min-w-0 rounded-lg border px-4 py-3 transition",
        active ? "border-primary shadow-[inset_0_0_0_1px_var(--primary)]" : "border-border",
        interactive && "cursor-pointer hover:border-primary/40 hover:shadow-sm",
      )}
    >
      {item.onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            item.onRemove?.();
          }}
          className="text-muted-foreground/40 hover:bg-muted hover:text-change-up absolute top-1 right-1 size-5 rounded-full opacity-0 transition group-hover:opacity-100"
          title="移除"
        >
          ×
        </button>
      )}
      <div className="text-muted-foreground text-xs">{item.label}</div>
      <div className="kpi-value mt-1">{item.value}</div>
      {item.footer != null && (
        <div className="text-muted-foreground mt-1 text-xs">{item.footer}</div>
      )}
    </div>
  );
}
