"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";

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
}

const JOB_LABEL: Record<string, string> = {
  "crawler:check_data_ready": "数据就绪检查",
  "crawler:fetch_profile": "主播档案",
  "crawler:fetch_daily": "主播日报",
  "crawler:fetch_portrait": "主播肖像",
  "crawler:fetch_game": "推广游戏",
  "crawler:fetch_minigame": "小游戏",
};

const STATE_LABEL: Record<string, string> = {
  created: "排队中",
  retry: "重试中",
  active: "运行中",
  completed: "完成",
  cancelled: "取消",
  failed: "失败",
  expired: "过期",
};

export function QueueStatus(): React.JSX.Element {
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  async function reload(): Promise<void> {
    try {
      const res = await fetch("/api/admin/crawler/status");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { jobs: JobRow[]; summary: Record<string, number> };
      setJobs(data.jobs);
      setSummary(data.summary);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void reload();
    const t = setInterval(reload, 5000);
    return () => clearInterval(t);
  }, []);

  if (error) return <div className="text-change-up text-sm">加载失败: {error}</div>;
  if (!jobs) return <div className="text-muted-foreground text-sm">加载中...</div>;

  return (
    <div className="bg-card rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">采集队列（最近 24 小时）</h3>
        <button
          onClick={() => void reload()}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          刷新
        </button>
      </div>

      {Object.keys(summary).length > 0 && (
        <div className="flex flex-wrap gap-3 text-sm">
          {Object.entries(summary).map(([state, count]) => (
            <span key={state} className="text-muted-foreground">
              {STATE_LABEL[state] ?? state}{" "}
              <strong
                className={cn(
                  "text-foreground",
                  state === "active" && "text-primary",
                  state === "failed" && "text-change-up",
                  state === "completed" && "text-change-down",
                )}
              >
                {count}
              </strong>
            </span>
          ))}
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="text-muted-foreground text-sm">最近 24 小时没有 job</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-muted-foreground text-xs">
              <tr className="border-b">
                <th className="px-2 py-1.5 text-left">Job</th>
                <th className="px-2 py-1.5 text-left">日期</th>
                <th className="px-2 py-1.5 text-left">状态</th>
                <th className="px-2 py-1.5 text-right">耗时</th>
                <th className="px-2 py-1.5 text-left">完成时间</th>
                <th className="px-2 py-1.5 text-left">错误</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-2 py-1.5">{JOB_LABEL[j.name] ?? j.name}</td>
                  <td className="px-2 py-1.5">{j.date ?? "—"}</td>
                  <td className="px-2 py-1.5">
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded text-xs",
                        j.state === "active" && "bg-primary/10 text-primary",
                        j.state === "completed" && "bg-change-down/10 text-change-down",
                        j.state === "failed" && "bg-change-up/10 text-change-up",
                        j.state === "created" && "bg-muted text-muted-foreground",
                        j.state === "retry" && "bg-amber-500/10 text-amber-600",
                      )}
                    >
                      {STATE_LABEL[j.state] ?? j.state}
                      {j.attempt && j.attempt > 1 ? ` ×${j.attempt}` : ""}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground">
                    {j.dur_s != null ? `${j.dur_s}s` : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {j.completed_on
                      ? new Date(j.completed_on).toLocaleTimeString("zh-CN", { hour12: false })
                      : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-change-up text-xs max-w-[200px] truncate">
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
