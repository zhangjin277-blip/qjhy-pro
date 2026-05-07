"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { rerunCrawl, backfillRange } from "@/modules/crawler";

const JOB_OPTIONS: { value: "minigame" | "daily" | "portrait" | "profile"; label: string }[] = [
  { value: "minigame", label: "小游戏数据" },
  { value: "daily", label: "主播日报" },
  { value: "portrait", label: "主播肖像" },
  { value: "profile", label: "主播档案" },
];

export function ManualRerun(): React.JSX.Element {
  const [date, setDate] = useState(new Date(Date.now() - 86400_000).toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // 范围补数据
  const today = new Date().toISOString().slice(0, 10);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  const [bfJob, setBfJob] = useState<"minigame" | "daily" | "portrait" | "profile">("minigame");
  const [bfFrom, setBfFrom] = useState(ninetyDaysAgo);
  const [bfTo, setBfTo] = useState(today);
  const [bfBusy, setBfBusy] = useState(false);
  const [bfMsg, setBfMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  return (
    <div className="bg-card space-y-4 rounded-lg border p-4">
      {/* 单日全量重跑（CHECK_DATA_READY 触发整条流水线）*/}
      <div className="space-y-2">
        <h3 className="font-semibold">手动重跑（单日 · 全量）</h3>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="max-w-[160px]"
          />
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMsg(null);
              try {
                await rerunCrawl({ date, basecamp: "cs" });
                setMsg({ kind: "ok", text: `已入队 ${date}（cs）` });
              } catch (e) {
                setMsg({ kind: "err", text: `失败: ${(e as Error).message}` });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "入队中..." : "重跑"}
          </Button>
        </div>
        {msg && (
          <div
            className={
              msg.kind === "ok"
                ? "text-change-down text-sm"
                : "text-change-up text-sm whitespace-pre-wrap"
            }
          >
            {msg.text}
          </div>
        )}
      </div>

      {/* 按类型补范围（仅入队选定 job × 每日，不会触发其他任务）*/}
      <div className="space-y-2 border-t pt-4">
        <h3 className="font-semibold">补数据（指定类型 × 日期范围）</h3>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={bfJob}
            onChange={(e) =>
              setBfJob(e.target.value as "minigame" | "daily" | "portrait" | "profile")
            }
            className="bg-card h-8 rounded border border-input px-2 text-sm"
          >
            {JOB_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Input
            type="date"
            value={bfFrom}
            onChange={(e) => setBfFrom(e.target.value)}
            className="max-w-[160px]"
          />
          <span className="text-muted-foreground text-xs">~</span>
          <Input
            type="date"
            value={bfTo}
            onChange={(e) => setBfTo(e.target.value)}
            className="max-w-[160px]"
          />
          <Button
            disabled={bfBusy}
            onClick={async () => {
              setBfBusy(true);
              setBfMsg(null);
              try {
                const r = await backfillRange({
                  job: bfJob,
                  from: bfFrom,
                  to: bfTo,
                  basecamp: "cs",
                });
                setBfMsg({
                  kind: "ok",
                  text: `已入队 ${r.days} 天（${bfJob} · ${bfFrom} ~ ${bfTo}）`,
                });
              } catch (e) {
                setBfMsg({ kind: "err", text: `失败: ${(e as Error).message}` });
              } finally {
                setBfBusy(false);
              }
            }}
          >
            {bfBusy ? "入队中..." : "入队"}
          </Button>
        </div>
        {bfMsg && (
          <div
            className={
              bfMsg.kind === "ok"
                ? "text-change-down text-sm"
                : "text-change-up text-sm whitespace-pre-wrap"
            }
          >
            {bfMsg.text}
          </div>
        )}
      </div>
    </div>
  );
}
