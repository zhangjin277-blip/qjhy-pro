"use client";

import { useEffect, useRef, useState } from "react";
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
  const logRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
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

  useEffect(() => {
    if (followRef.current && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [jobs, filter, showHighFreq]);

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
    <div className="bg-card space-y-4 rounded-2xl border p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">采集日志（最近 24 小时）</h3>
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

      <div
        ref={logRef}
        tabIndex={0}
        aria-label="采集任务日志"
        onScroll={() => {
          const el = logRef.current;
          if (el) followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="h-[430px] overflow-y-auto rounded-2xl bg-[#1b1b2d] p-5 font-mono text-[13px] leading-7"
      >
        {visible.length === 0 ? (
          <p className="text-slate-400">没有符合条件的采集日志</p>
        ) : (
          [...visible]
            .sort(
              (a, b) =>
                new Date(a.completed_on ?? a.started_on ?? a.created_on).getTime() -
                new Date(b.completed_on ?? b.started_on ?? b.created_on).getTime(),
            )
            .map((job) => (
              <div
                key={job.id}
                className={cn(
                  "whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
                  job.state === "completed"
                    ? "text-green-400"
                    : job.state === "failed" || job.state === "expired"
                      ? "text-red-400"
                      : job.state === "retry"
                        ? "text-amber-300"
                        : "text-blue-300",
                )}
              >
                [
                {new Date(job.completed_on ?? job.started_on ?? job.created_on).toLocaleString(
                  "zh-CN",
                  { timeZone: "Asia/Shanghai", hour12: false },
                )}
                ] [{JOB_LABEL[job.name] ?? job.name}] {STATE_LABEL[job.state] ?? job.state}
                {job.date ? ` · 数据日期 ${job.date}` : ""}
                {job.state === "completed" ? ` · ${formatOutputSummary(job.output)}` : ""}
                {job.dur_s != null ? ` · 耗时 ${job.dur_s}s` : ""}
                {job.attempt && job.attempt > 1 ? ` · 第 ${job.attempt} 次尝试` : ""}
                {job.err ? ` · ${job.err}` : ""}
              </div>
            ))
        )}
      </div>
    </div>
  );
}
