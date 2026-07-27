"use client";

import { useEffect, useState } from "react";
import type { KpiSummary } from "@/modules/placement/server";
import { Sparkline } from "./sparkline";
import { formatChineseNumber, formatVsPrevShort } from "./format";
import { cn } from "@/lib/utils/cn";

interface Props {
  dateFrom: string;
  dateTo: string;
}

export function BuyuSection({ dateFrom, dateTo }: Props): React.JSX.Element {
  const [data, setData] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/dashboard/buyu?date_from=${dateFrom}&date_to=${dateTo}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<KpiSummary>;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [dateFrom, dateTo]);

  const cards = buildCards(data);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-3 flex items-baseline gap-2">
        <h3 className="text-[14px] font-semibold text-slate-900">捕鱼大作战 · 投放数据</h3>
        <span className="text-[11px] text-slate-500">
          {dateFrom} ~ {dateTo}
        </span>
        {loading && <span className="text-[11px] text-slate-500">加载中…</span>}
      </header>

      {error ? (
        <div className="rounded-md border border-[#ffd6d6] bg-[#fff2f2] px-3 py-2 text-[12px] text-[#f53f3f]">
          数据加载失败：{error}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {cards.map(({ key, ...rest }) => (
            <Card key={key} {...rest} />
          ))}
        </div>
      )}
    </section>
  );
}

interface CardSpec {
  key: string;
  label: string;
  value: string;
  vs: { text: string; kind: "up" | "down" | "flat" | "none" };
  hint: string;
  sparkline: number[];
}

function buildCards(data: KpiSummary | null): CardSpec[] {
  const zero: CardSpec[] = [
    {
      key: "cost",
      label: "消耗",
      value: "—",
      vs: { text: "—", kind: "none" },
      hint: "较前期",
      sparkline: [],
    },
    {
      key: "activations",
      label: "激活",
      value: "—",
      vs: { text: "—", kind: "none" },
      hint: "较前期",
      sparkline: [],
    },
    {
      key: "cpa",
      label: "激活单价",
      value: "—",
      vs: { text: "—", kind: "none" },
      hint: "消耗 / 激活",
      sparkline: [],
    },
    {
      key: "payment",
      label: "付费",
      value: "—",
      vs: { text: "—", kind: "none" },
      hint: "较前期",
      sparkline: [],
    },
    {
      key: "roi",
      label: "ROI",
      value: "—",
      vs: { text: "—", kind: "none" },
      hint: "付费 / 消耗",
      sparkline: [],
    },
  ];
  if (!data) return zero;

  const costSpark = data.daily.map((d) => d.cost);
  const actSpark = data.daily.map((d) => d.activations);
  const paySpark = data.daily.map((d) => d.payment);

  return [
    {
      key: "cost",
      label: "消耗",
      value: `¥${formatChineseNumber(data.cost)}`,
      vs: formatVsPrevShort(data.cost, data.prev.cost),
      hint: "较前期",
      sparkline: costSpark,
    },
    {
      key: "activations",
      label: "激活",
      value: data.activations.toLocaleString("zh-CN"),
      vs: formatVsPrevShort(data.activations, data.prev.activations),
      hint: "较前期",
      sparkline: actSpark,
    },
    {
      key: "cpa",
      label: "激活单价",
      value: data.cpa > 0 ? `¥${data.cpa.toFixed(2)}` : "—",
      // CPA 走势：上升=坏（红），下降=好（绿），跟其他指标方向相反
      vs: invertVs(formatVsPrevShort(data.cpa, data.prev.cpa)),
      hint: "消耗 / 激活",
      sparkline: [],
    },
    {
      key: "payment",
      label: "付费",
      value: `¥${formatChineseNumber(data.payment)}`,
      vs: formatVsPrevShort(data.payment, data.prev.payment),
      hint: "较前期",
      sparkline: paySpark,
    },
    {
      key: "roi",
      label: "ROI",
      value: data.cost > 0 ? data.roi.toFixed(3) : "—",
      vs: formatVsPrevShort(data.roi, data.prev.roi),
      hint: "付费 / 消耗",
      sparkline: [],
    },
  ];
}

/** CPA 等"越低越好"的指标，箭头方向反转语义颜色，文本不变 */
function invertVs(vs: { text: string; kind: "up" | "down" | "flat" | "none" }): {
  text: string;
  kind: "up" | "down" | "flat" | "none";
} {
  if (vs.kind === "up") return { ...vs, kind: "down" };
  if (vs.kind === "down") return { ...vs, kind: "up" };
  return vs;
}

function Card({ label, value, vs, hint, sparkline }: CardSpec): React.JSX.Element {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50/40 px-3 py-2.5">
      <div className="text-[11px] font-medium text-[#667085]">{label}</div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="text-[20px] font-semibold leading-none tracking-tight text-slate-900 tabular-nums">
          {value}
        </span>
        {sparkline.length >= 2 && (
          <Sparkline data={sparkline} width={64} height={20} className="shrink-0 opacity-90" />
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[11px]">
        <span
          className={cn(
            vs.kind === "up" && "text-change-up",
            vs.kind === "down" && "text-change-down",
            (vs.kind === "flat" || vs.kind === "none") && "text-[#667085]",
          )}
        >
          {vs.text}
        </span>
        <span className="text-[#667085]">{hint}</span>
      </div>
    </div>
  );
}
