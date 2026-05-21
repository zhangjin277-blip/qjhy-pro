"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CoreKpiResponse,
  DashboardOverviewResponse,
  Section2Metric,
} from "@/modules/dashboard";
import { CoreKpiSection, type TimePreset } from "./core-kpi-section";
import { BreakdownSection, type BreakdownClick } from "./breakdown-section";
import { DashboardDrawer, type DrawerOpenPayload } from "./dashboard-drawer";
import { BuyuSection } from "./buyu-section";

/**
 * 把 TimePreset 翻译成 [date_from, date_to] 区间。
 *
 * 默认基准日 = 「昨天」（生产数据 T+1，今天的数据通常是空的）。
 * - today      → [today, today]
 * - yesterday  → [yesterday, yesterday]
 * - month      → [本月 1 号, today]
 *
 * NOTE: 全部用本地时区的日期（YYYY-MM-DD），不引时区库。
 */
function presetToRange(
  preset: TimePreset,
  customRange: { from: string; to: string },
): { from: string; to: string } {
  const now = new Date();
  const yesterday = toIsoDate(new Date(now.getTime() - 86400_000));
  if (preset === "custom") return customRange;
  if (preset === "yesterday") return { from: yesterday, to: yesterday };
  if (preset === "last7") {
    const from = toIsoDate(new Date(now.getTime() - 7 * 86400_000));
    return { from, to: yesterday };
  }
  if (preset === "last30") {
    const from = toIsoDate(new Date(now.getTime() - 30 * 86400_000));
    return { from, to: yesterday };
  }
  if (preset === "this_month") {
    const firstOfMonth = toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
    // 边界：今天是 1 号时 yesterday 在上月，让 from = to 避免空区间
    return { from: firstOfMonth, to: yesterday < firstOfMonth ? firstOfMonth : yesterday };
  }
  // last_month
  const firstOfLastMonth = toIsoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  // new Date(year, month, 0) → 上月最后一天
  const lastOfLastMonth = toIsoDate(new Date(now.getFullYear(), now.getMonth(), 0));
  return { from: firstOfLastMonth, to: lastOfLastMonth };
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function DashboardBoard(): React.JSX.Element {
  // 默认 = 近 7 日（spec 要求；昨天数据可能未结算）
  const [preset, setPreset] = useState<TimePreset>("last7");
  // 自定义日期范围：默认初始化为「近 7 日」
  const [customRange, setCustomRange] = useState<{ from: string; to: string }>(() => {
    const now = new Date();
    return {
      from: toIsoDate(new Date(now.getTime() - 7 * 86400_000)),
      to: toIsoDate(new Date(now.getTime() - 86400_000)),
    };
  });
  const [metric, setMetric] = useState<Section2Metric>("total_fan_ticket");
  const [data, setData] = useState<DashboardOverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerOpenPayload | null>(null);

  const range = useMemo(() => presetToRange(preset, customRange), [preset, customRange]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const url = `/api/dashboard?date_from=${range.from}&date_to=${range.to}`;
    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<DashboardOverviewResponse>;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
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
  }, [range.from, range.to]);

  const core: CoreKpiResponse | null = data?.core ?? null;

  const handleCardClick = (key: keyof CoreKpiResponse): void => {
    // Section 1：全业务（不分项目），metric = key
    setDrawer({
      metric: key,
      date_from: range.from,
      date_to: range.to,
    });
  };

  const handleCellClick = (c: BreakdownClick): void => {
    // Section 2：携带 project + group
    setDrawer({
      metric: c.metric,
      project: c.project,
      group: c.group,
      date_from: range.from,
      date_to: range.to,
    });
  };

  return (
    <div className="space-y-5">
      <CoreKpiSection
        core={core}
        loading={loading}
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customRange.from}
        customTo={customRange.to}
        onCustomChange={setCustomRange}
        onCardClick={handleCardClick}
      />
      <BreakdownSection
        data={data}
        loading={loading}
        metric={metric}
        onMetricChange={setMetric}
        onCellClick={handleCellClick}
      />
      <BuyuSection dateFrom={range.from} dateTo={range.to} />
      {error ? (
        <div className="rounded-md bg-[#fff2f2] border border-[#ffd6d6] text-[#f53f3f] px-4 py-3 text-[13px]">
          数据加载失败：{error}
        </div>
      ) : null}
      <DashboardDrawer payload={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}
