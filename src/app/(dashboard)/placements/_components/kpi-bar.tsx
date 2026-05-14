import type { KpiSummary } from "@/modules/placement/server";

interface KpiBarProps {
  data: KpiSummary;
}

function formatChineseNumber(n: number): string {
  if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2).replace(/\.?0+$/, "") + "亿";
  if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(2).replace(/\.?0+$/, "") + "万";
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function pctDelta(cur: number, prev: number): { kind: "up" | "down" | "flat"; pct: number } | null {
  if (prev === 0) return cur > 0 ? { kind: "up", pct: 100 } : null;
  const delta = ((cur - prev) / prev) * 100;
  if (Math.abs(delta) < 0.5) return { kind: "flat", pct: 0 };
  return { kind: delta > 0 ? "up" : "down", pct: Math.abs(delta) };
}

function Footer({ cur, prev, meta }: { cur: number; prev: number; meta: string }) {
  const d = pctDelta(cur, prev);
  return (
    <>
      {d?.kind === "up" && <span className="text-change-up">↑ {d.pct.toFixed(1)}%</span>}
      {d?.kind === "down" && <span className="text-change-down">↓ {d.pct.toFixed(1)}%</span>}
      {d?.kind === "flat" && <span className="text-muted-foreground/70">— 持平</span>}
      <span className="text-muted-foreground/70 ml-1">{meta}</span>
    </>
  );
}

export function KpiBar({ data }: KpiBarProps) {
  const items = [
    {
      key: "cost",
      label: "消耗",
      value: formatChineseNumber(data.cost),
      footer: <Footer cur={data.cost} prev={data.prev.cost} meta="较前期" />,
    },
    {
      key: "activations",
      label: "激活数",
      value: data.activations.toLocaleString("zh-CN"),
      footer: (
        <Footer
          cur={data.activations}
          prev={data.prev.activations}
          meta={`CPA ¥${data.cpa.toFixed(0)}`}
        />
      ),
    },
    {
      key: "payment",
      label: "付费",
      value: formatChineseNumber(data.payment),
      footer: <Footer cur={data.payment} prev={data.prev.payment} meta="较前期" />,
    },
    {
      key: "roi",
      label: "ROI",
      value: data.roi.toFixed(3),
      footer: <Footer cur={data.roi} prev={data.prev.roi} meta="付费 / 消耗" />,
    },
  ];

  return (
    <div className="rounded-lg border border-border bg-card px-4 py-2.5 shadow-sm">
      <div className="grid min-w-0 grid-cols-2 divide-y divide-border/60 md:grid-cols-4 md:divide-x md:divide-y-0">
        {items.map((it, index) => (
          <div key={it.key} className={index === 0 ? "py-1 pr-4" : "px-4 py-1"}>
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 text-xs text-muted-foreground">{it.label}</span>
              <span className="truncate text-[22px] font-semibold leading-none tracking-tight text-slate-900 tabular-nums">
                {it.value}
              </span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{it.footer}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
