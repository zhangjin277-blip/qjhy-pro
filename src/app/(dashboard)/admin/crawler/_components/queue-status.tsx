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
  output: Record<string, unknown> | null;
}

/**
 * 把 handler 返回的 output（pgboss.job.output）格式化成简短文本。
 * 各 handler 字段不一致，按优先级提取常用统计字段。
 */
function formatOutputSummary(output: Record<string, unknown> | null): string {
  if (!output) return "—";
  const num = (k: string): number | null => {
    const v = output[k];
    return typeof v === "number" ? v : null;
  };
  // 快手 history：fromDate~toDate 范围
  const inserted = num("inserted");
  const updated = num("updated");
  const total = num("total");
  const rows = num("rows");
  const fail = num("fail");
  const unmatched = num("unmatched");
  const skippedHistory = num("skippedHistory");
  // 优先 inserted/updated 详细；否则 rows/total
  if (inserted !== null && updated !== null) {
    const parts = [`+${inserted}`, `~${updated}`];
    if (skippedHistory !== null && skippedHistory > 0) parts.push(`跳${skippedHistory}`);
    return parts.join(" / ");
  }
  if (rows !== null) {
    const parts = [`${rows} 行`];
    if (fail !== null && fail > 0) parts.push(`失败 ${fail}`);
    if (unmatched !== null && unmatched > 0) parts.push(`未匹配 ${unmatched}`);
    return parts.join(" · ");
  }
  if (total !== null) return `${total} 行`;
  // check_data_ready 之类
  if ("ready" in output) return output.ready === true ? "就绪" : "未就绪";
  return "—";
}

const JOB_LABEL: Record<string, string> = {
  "crawler:check_data_ready": "数据就绪检查",
  "crawler:fetch_profile": "主播档案",
  "crawler:fetch_daily": "主播日报",
  "crawler:fetch_portrait": "主播肖像",
  "crawler:fetch_game": "推广游戏",
  "crawler:fetch_minigame": "小游戏",
  "crawler:sync_kuaishou_members": "快手·成员同步",
  "crawler:sync_kuaishou_history_live": "快手·历史直播",
  "crawler:sync_kuaishou_today_live": "快手·今日实时直播",
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
                <th className="px-2 py-1.5 text-left">更新</th>
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
                  <td className="px-2 py-1.5 text-foreground text-xs">
                    {formatOutputSummary(j.output)}
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
