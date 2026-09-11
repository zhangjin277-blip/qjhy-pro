"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, BarChart3 } from "lucide-react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PerformanceScoreStatisticsRow } from "@/modules/people-performance";

const BANDS = [
  {
    key: "lt60",
    label: "60分以下（不含60）",
    color: "#ef4444",
    matches: (score: number | null) => score !== null && score < 60,
  },
  {
    key: "60to69",
    label: "60-69分",
    color: "#f97316",
    matches: (score: number | null) => score !== null && score >= 60 && score < 70,
  },
  {
    key: "70to79",
    label: "70-79分",
    color: "#eab308",
    matches: (score: number | null) => score !== null && score >= 70 && score < 80,
  },
  {
    key: "80to89",
    label: "80-89分",
    color: "#22c55e",
    matches: (score: number | null) => score !== null && score >= 80 && score < 90,
  },
  {
    key: "90to100",
    label: "90-100分",
    color: "#2563eb",
    matches: (score: number | null) => score !== null && score >= 90,
  },
] as const;

export function PerformanceStatisticsClient({ rows }: { rows: PerformanceScoreStatisticsRow[] }) {
  const [period, setPeriod] = useState("all");
  const periods = useMemo(
    () =>
      [...new Map(rows.map((row) => [row.cycleLabel, row.periodStart])).entries()].sort((a, b) =>
        b[1].localeCompare(a[1]),
      ),
    [rows],
  );
  const filteredRows = useMemo(
    () => (period === "all" ? rows : rows.filter((row) => row.cycleLabel === period)),
    [period, rows],
  );
  const chartData = BANDS.map((band) => ({
    ...band,
    count: filteredRows.filter((row) => band.matches(row.score)).length,
  }));
  const scoredCount = filteredRows.filter((row) => row.score !== null).length;

  return (
    <div className="min-w-0 space-y-4 px-1 py-1 md:px-1.5 md:py-1.5">
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex items-center gap-3">
          <Link
            href="/people-performance"
            aria-label="返回人员绩效"
            className="inline-flex size-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="text-base font-semibold text-slate-900">绩效统计分析</h1>
            <p className="text-xs text-muted-foreground">按考核周期查看最终评分分布</p>
          </div>
        </div>
        <Select value={period} onValueChange={(value) => setPeriod(value ?? "all")}>
          <SelectTrigger className="w-[190px]">
            <SelectValue>
              {(value) => (value === "all" ? "全部考核周期" : value || "考核周期")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部考核周期</SelectItem>
            {periods.map(([label]) => (
              <SelectItem key={label} value={label}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <section className="rounded-md border bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <BarChart3 className="size-4 text-blue-600" />
            评分分布
          </div>
          <span className="text-xs text-muted-foreground">
            共 {filteredRows.length} 人，已评分 {scoredCount} 人
          </span>
        </div>
        <div className="h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 12 }} />
              <Tooltip formatter={(value) => [`${value} 人`, "人数"]} />
              <Bar dataKey="count" name="人数" radius={[4, 4, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-md border bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">人员明细</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {BANDS.map((band) => {
            const bandRows = filteredRows.filter((row) => band.matches(row.score));
            return (
              <div key={band.key} className="rounded-md border border-slate-200 p-3">
                <div className="flex items-center justify-between border-b pb-2 text-sm font-medium">
                  <span style={{ color: band.color }}>{band.label}</span>
                  <span>{bandRows.length}人</span>
                </div>
                <div className="mt-2 space-y-1.5 text-xs text-slate-600">
                  {bandRows.length === 0 ? (
                    <div className="text-muted-foreground">暂无人员</div>
                  ) : (
                    bandRows.map((row) => (
                      <div
                        key={`${row.cycleId}:${row.userId}`}
                        className="flex justify-between gap-2"
                      >
                        <span className="truncate">{row.name}</span>
                        <span className="font-medium text-slate-900">
                          {row.score === null ? "待评分" : row.score}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
