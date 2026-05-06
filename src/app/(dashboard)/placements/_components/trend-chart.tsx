"use client";
import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import type { TrendPoint } from "@/modules/placement/server";

type Metric = "cost" | "acts" | "payment";
type Granularity = "hour" | "day";

const METRIC_LABELS: Record<Metric, string> = {
  cost: "消耗",
  acts: "激活数",
  payment: "付费",
};

// Deterministic color from string
function colorFromString(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 45%)`;
}

interface TrendChartProps {
  data: TrendPoint[];
}

export function TrendChart({ data }: TrendChartProps) {
  const [metric, setMetric] = useState<Metric>("cost");
  const [granularity, setGranularity] = useState<Granularity>("hour");
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());

  const allAnchors = useMemo(() => {
    const set = new Set<string>();
    data.forEach((d) => set.add(d.anchor));
    return [...set].sort();
  }, [data]);

  // Pivot: key = "MM-DD HH:00" or "MM-DD", value = {[anchor]: number}
  const chartData = useMemo(() => {
    const buckets = new Map<string, Record<string, number>>();

    for (const pt of data) {
      const key =
        granularity === "hour"
          ? `${pt.date.slice(5)} ${String(pt.hour).padStart(2, "0")}:00`
          : pt.date.slice(5);

      if (!buckets.has(key)) buckets.set(key, { _key: key as never });
      const bucket = buckets.get(key);
      if (bucket) {
        bucket[pt.anchor] = Number(bucket[pt.anchor] ?? 0) + pt[metric];
      }
    }

    return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [data, metric, granularity]);

  function toggleLine(anchor: string) {
    setHiddenLines((prev) => {
      const next = new Set(prev);
      if (next.has(anchor)) next.delete(anchor);
      else next.add(anchor);
      return next;
    });
  }

  function hideAll() {
    setHiddenLines(new Set(allAnchors));
  }

  function showAll() {
    setHiddenLines(new Set());
  }

  const metricFormatter = (v: number) =>
    metric === "cost" || metric === "payment"
      ? `¥${v.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`
      : v.toLocaleString("zh-CN");

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Metric */}
        <div className="flex gap-0 rounded-md border border-slate-200 p-0.5 bg-slate-50">
          {(["cost", "acts", "payment"] as Metric[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                metric === m
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {METRIC_LABELS[m]}
            </button>
          ))}
        </div>

        {/* Granularity */}
        <div className="flex gap-0 rounded-md border border-slate-200 p-0.5 bg-slate-50">
          {(["hour", "day"] as Granularity[]).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                granularity === g
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {g === "hour" ? "小时" : "按天"}
            </button>
          ))}
        </div>

        <div className="ml-auto flex gap-2">
          <button
            onClick={showAll}
            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            全显
          </button>
          <button
            onClick={hideAll}
            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            全隐
          </button>
        </div>
      </div>

      {/* Anchor chips */}
      {allAnchors.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {allAnchors.map((anchor) => {
            const hidden = hiddenLines.has(anchor);
            const color = colorFromString(anchor);
            return (
              <button
                key={anchor}
                onClick={() => toggleLine(anchor)}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-opacity ${
                  hidden ? "opacity-40" : "opacity-100"
                }`}
                style={{ borderColor: color, color }}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                {anchor}
              </button>
            );
          })}
        </div>
      )}

      {/* Chart */}
      {chartData.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-400">无数据</div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="_key"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              tickFormatter={(v: number) =>
                metric === "cost" || metric === "payment"
                  ? v >= 1000
                    ? `¥${(v / 1000).toFixed(0)}k`
                    : `¥${v}`
                  : v >= 1000
                    ? `${(v / 1000).toFixed(0)}k`
                    : String(v)
              }
              width={64}
            />
            <Tooltip
              formatter={(v) => [
                typeof v === "number" ? metricFormatter(v) : String(v ?? ""),
                undefined,
              ]}
              labelStyle={{ fontSize: 12 }}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {allAnchors.map((anchor) => (
              <Line
                key={anchor}
                type="monotone"
                dataKey={anchor}
                stroke={colorFromString(anchor)}
                dot={false}
                strokeWidth={1.5}
                hide={hiddenLines.has(anchor)}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
