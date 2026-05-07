import type { KpiSummary } from "@/modules/placement/server";

interface KpiBarProps {
  data: KpiSummary;
}

function formatChineseNumber(n: number): string {
  if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2).replace(/\.?0+$/, "") + "亿";
  if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(2).replace(/\.?0+$/, "") + "万";
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

interface Cell {
  label: string;
  value: string;
  delta: { kind: "up" | "down" | "flat"; pct: number } | null;
  meta: string;
}

function pctDelta(cur: number, prev: number): { kind: "up" | "down" | "flat"; pct: number } | null {
  if (prev === 0) return cur > 0 ? { kind: "up", pct: 100 } : null;
  const delta = ((cur - prev) / prev) * 100;
  if (Math.abs(delta) < 0.5) return { kind: "flat", pct: 0 };
  return { kind: delta > 0 ? "up" : "down", pct: Math.abs(delta) };
}

export function KpiBar({ data }: KpiBarProps) {
  const cells: Cell[] = [
    {
      label: "消耗",
      value: formatChineseNumber(data.cost),
      delta: pctDelta(data.cost, data.prev.cost),
      meta: "较前期",
    },
    {
      label: "激活数",
      value: data.activations.toLocaleString("zh-CN"),
      delta: pctDelta(data.activations, data.prev.activations),
      meta: `CPA ¥${data.cpa.toFixed(0)}`,
    },
    {
      label: "付费",
      value: formatChineseNumber(data.payment),
      delta: pctDelta(data.payment, data.prev.payment),
      meta: "较前期",
    },
    {
      label: "ROI",
      value: data.roi.toFixed(3),
      delta: pctDelta(data.roi, data.prev.roi),
      meta: "付费 / 消耗",
    },
  ];

  return (
    <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {cells.map((c) => (
        <div key={c.label} className="min-w-0 rounded-lg border border-border bg-card px-4 py-3">
          <div className="text-muted-foreground text-xs">{c.label}</div>
          <div className="kpi-value mt-1">{c.value}</div>
          <div className="text-muted-foreground mt-1 text-xs">
            {c.delta && c.delta.kind === "up" && (
              <span className="text-change-up">↑ {c.delta.pct.toFixed(1)}%</span>
            )}
            {c.delta && c.delta.kind === "down" && (
              <span className="text-change-down">↓ {c.delta.pct.toFixed(1)}%</span>
            )}
            {c.delta && c.delta.kind === "flat" && (
              <span className="text-muted-foreground/70">— 持平</span>
            )}
            <span className="ml-1 text-muted-foreground/70">{c.meta}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
