"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { JOB_LABEL, STATE_LABEL, HIGH_FREQ_JOBS, formatOutputSummary } from "../_lib/job-meta";

interface JobRow {
  id: string;
  name: string;
  state: string;
  date: string | null;
  attempt: number | null;
  created_on: string;
  started_on: string | null;
  completed_on: string | null;
  dur_s: number | null;
  err: string | null;
  output: Record<string, unknown> | null;
}

type Filter = "all" | "failed" | "active";

export function LogTable(): React.JSX.Element {
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [showHighFreq, setShowHighFreq] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function reload(): Promise<void> {
      try {
        const res = await fetch(`/api/admin/crawler/status${showHighFreq ? "?all=1" : ""}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { jobs: JobRow[] };
        if (cancelled) return;
        setJobs(data.jobs);
        setError(null);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }
    void reload();
    const t = setInterval(reload, 10_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [showHighFreq]);

  if (error) return <div className="text-change-up text-sm">加载失败: {error}</div>;
  if (!jobs) return <div className="text-muted-foreground text-sm">加载中...</div>;

  const visible = jobs.filter((j) => {
    if (!showHighFreq && HIGH_FREQ_JOBS.includes(j.name)) return false;
    if (filter === "failed") return j.state === "failed" || j.state === "expired";
    if (filter === "active")
      return j.state === "active" || j.state === "created" || j.state === "retry";
    return true;
  });

  const chip = (key: Filter, label: string): React.JSX.Element => (
    <button
      key={key}
      onClick={() => setFilter(key)}
      className={cn(
        "rounded-full border px-3 py-1 text-xs",
        filter === key
          ? "border-blue-500 bg-blue-500 text-white"
          : "border-border bg-card text-slate-600 hover:bg-slate-50",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="bg-card space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">执行流水（最近 24 小时）</h3>
        <span className="text-muted-foreground text-xs">10 秒自动刷新</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {chip("all", "全部")}
        {chip("failed", "仅失败")}
        {chip("active", "运行/排队")}
        <label className="text-muted-foreground ml-3 flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={showHighFreq}
            onChange={(e) => setShowHighFreq(e.target.checked)}
          />
          显示高频任务（趋势快照 / 今日实时）
        </label>
      </div>

      {visible.length === 0 ? (
        <div className="text-muted-foreground text-sm">没有符合条件的记录</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-muted-foreground text-xs">
              <tr className="border-b">
                <th className="px-2 py-1.5 text-left">任务</th>
                <th className="px-2 py-1.5 text-left">日期</th>
                <th className="px-2 py-1.5 text-left">状态</th>
                <th className="px-2 py-1.5 text-left">结果</th>
                <th className="px-2 py-1.5 text-right">耗时</th>
                <th className="px-2 py-1.5 text-left">完成时间</th>
                <th className="px-2 py-1.5 text-left">错误</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((j) => (
                <tr key={j.id} className="hover:bg-muted/40 border-b last:border-0">
                  <td className="px-2 py-1.5">{JOB_LABEL[j.name] ?? j.name}</td>
                  <td className="px-2 py-1.5">{j.date ?? "—"}</td>
                  <td className="px-2 py-1.5">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-xs",
                        j.state === "active" && "text-primary bg-primary/10",
                        j.state === "completed" && "bg-emerald-50 text-emerald-700",
                        (j.state === "failed" || j.state === "expired") && "bg-red-50 text-red-600",
                        j.state === "created" && "bg-muted text-muted-foreground",
                        j.state === "retry" && "bg-amber-500/10 text-amber-600",
                      )}
                    >
                      {STATE_LABEL[j.state] ?? j.state}
                      {j.attempt && j.attempt > 1 ? ` ×${j.attempt}` : ""}
                    </span>
                  </td>
                  <td className="text-foreground px-2 py-1.5 text-xs">
                    {formatOutputSummary(j.output)}
                  </td>
                  <td className="text-muted-foreground px-2 py-1.5 text-right">
                    {j.dur_s != null ? `${j.dur_s}s` : "—"}
                  </td>
                  <td className="text-muted-foreground px-2 py-1.5">
                    {j.completed_on
                      ? new Date(j.completed_on).toLocaleTimeString("zh-CN", { hour12: false })
                      : "—"}
                  </td>
                  <td className="max-w-[200px] truncate px-2 py-1.5 text-xs text-red-600">
                    {j.err ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
