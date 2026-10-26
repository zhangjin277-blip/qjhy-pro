"use client";

import { useId, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PresetChip, PresetToolbar } from "@/components/patterns/preset-toolbar";
import { businessDate } from "@/lib/business-date";
import type { CoreKpiResponse } from "@/modules/dashboard";
import { formatChineseNumber } from "./format";
import styles from "./business-board.module.css";

const metrics = [
  { key: "flow", label: "流水" },
  { key: "total_fan_ticket", label: "音浪" },
  { key: "active_anchor_count", label: "开播主播" },
] as const;
export function BusinessTrend({
  core,
  loading,
}: {
  core: CoreKpiResponse | null;
  loading: boolean;
}) {
  const [metric, setMetric] = useState<(typeof metrics)[number]["key"]>("flow");
  const gradient = useId();
  const values = core?.[metric].trend ?? [];
  const today = businessDate();
  const end = new Date(`${today}T00:00:00Z`).getTime();
  const rows = values.map((value, index) => ({
    date: new Date(end - (values.length - 1 - index) * 86400000).toISOString().slice(5, 10),
    value,
  }));
  const label = metrics.find((item) => item.key === metric)?.label;
  return (
    <section className={styles.panel} aria-label="近期趋势">
      <header className={styles.panelHeader}>
        <h2>
          <i />
          近期趋势<span className={styles.subtle}>近 14 天</span>
        </h2>
        <PresetToolbar label={null}>
          {metrics.map((item) => (
            <PresetChip
              key={item.key}
              active={item.key === metric}
              onClick={() => setMetric(item.key)}
            >
              {item.label}
            </PresetChip>
          ))}
        </PresetToolbar>
      </header>
      {rows.length === 0 ? (
        <div className={styles.empty}>{loading ? "正在加载趋势…" : "暂无趋势数据"}</div>
      ) : (
        <div className={styles.trendBody}>
          <div className={styles.chartSummary}>
            <span>最新日</span>
            <strong>
              {formatChineseNumber(values.at(-1) ?? 0)}
              {metric === "active_anchor_count" && " 人"}
            </strong>
            <span>
              {rows[0]?.date} — {rows.at(-1)?.date}
            </span>
          </div>
          <div
            role="img"
            aria-label={`最近14天每日${label}趋势，含今日，最新日 ${values.at(-1) ?? 0}`}
          >
            <ResponsiveContainer width="100%" height={175} minWidth={0}>
              <AreaChart data={rows} margin={{ top: 12, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5276e9" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#5276e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#eef1f7" strokeDasharray="3 4" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#98a5bb" }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={35}
                />
                <YAxis
                  width={48}
                  tick={{ fontSize: 10, fill: "#98a5bb" }}
                  tickFormatter={formatChineseNumber}
                  axisLine={false}
                  tickLine={false}
                  domain={[0, "auto"]}
                />
                <Tooltip
                  formatter={(value) => [formatChineseNumber(Number(value)), label]}
                  contentStyle={{ borderRadius: 8, fontSize: 12, borderColor: "#edf0f6" }}
                />
                <Area
                  type="linear"
                  dataKey="value"
                  stroke="#5276e9"
                  strokeWidth={2.2}
                  fill={`url(#${gradient})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className={styles.chartFooter}>
            <span>每日{label}</span>
            <span>固定展示最近 14 天 · 含今日，日结数据 T+1</span>
          </div>
        </div>
      )}
    </section>
  );
}
