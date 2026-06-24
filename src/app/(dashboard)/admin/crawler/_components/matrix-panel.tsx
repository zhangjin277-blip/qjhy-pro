"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { rerunCrawl, backfillRange, triggerKuaishouSync } from "@/modules/crawler";
import { formatOutputSummary } from "../_lib/job-meta";

// ---- API 返回类型（与 /api/admin/crawler/matrix 对齐）----
interface MatrixCell {
  state: "ok" | "fail" | "run" | "queue";
  output: Record<string, unknown> | null;
  err: string | null;
  attempt: number | null;
  durS: number | null;
  time: string | null;
}
interface DatelessRun {
  state: "ok" | "fail" | "run" | "queue";
  output: Record<string, unknown> | null;
  err: string | null;
  time: string | null;
}
interface CookieHealth {
  basecamp: string;
  status: string;
  expiresAt: string | null;
  lastCheckAt: string | null;
}
interface MatrixData {
  days: string[];
  cells: Record<string, Record<string, MatrixCell>>;
  dateless: Record<string, DatelessRun>;
  cookies: CookieHealth[];
  fail24h: number;
}

// ---- 行配置 ----
type BackfillJob = "daily" | "profile" | "portrait" | "minigame";
interface DatedRow {
  job: string; // pgboss job name
  label: string;
  backfill: BackfillJob | null; // null = 不支持单独补（推广游戏只随整天重跑）
}
const BYTE_ROWS: DatedRow[] = [
  { job: "crawler:fetch_daily", label: "主播日报", backfill: "daily" },
  { job: "crawler:fetch_profile", label: "主播档案", backfill: "profile" },
  { job: "crawler:fetch_portrait", label: "主播肖像", backfill: "portrait" },
  { job: "crawler:fetch_minigame", label: "小游戏", backfill: "minigame" },
  { job: "crawler:fetch_game", label: "推广游戏", backfill: null },
];
const KS_HISTORY = "crawler:sync_kuaishou_history_live";
const DATELESS_ROWS: { job: string; label: string; freq: string; trigger?: "members" | "today" }[] =
  [
    {
      job: "crawler:sync_kuaishou_members",
      label: "成员同步",
      freq: "每日 1 次",
      trigger: "members",
    },
    {
      job: "crawler:sync_kuaishou_today_live",
      label: "今日实时直播",
      freq: "每 10 分钟",
      trigger: "today",
    },
    { job: "crawler:sync_kuaishou_live_snapshot", label: "直播趋势快照", freq: "每 5 分钟" },
    { job: "crawler:fetch_video", label: "抖音·视频快照", freq: "每日 1 次" },
  ];

const COOKIE_NAME: Record<string, string> = {
  cs: "百应 Cookie",
  nc1: "百应 Cookie (nc1)",
  nc2: "百应 Cookie (nc2)",
  kuaishou: "快手 Cookie",
};

// ---- 弹层状态 ----
interface PopTarget {
  kind: "cell" | "day";
  job?: DatedRow | { job: typeof KS_HISTORY; label: string };
  date: string;
  cell: MatrixCell | null;
  anchor: { x: number; y: number };
}

function fmtDay(ymd: string): { wd: string; md: string } {
  const d = new Date(`${ymd}T00:00:00+08:00`);
  const wd = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()] ?? "";
  return { wd, md: ymd.slice(5) };
}

export function MatrixPanel(): React.JSX.Element {
  const [data, setData] = useState<MatrixData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pop, setPop] = useState<PopTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [showBackfill, setShowBackfill] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/admin/crawler/matrix");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as MatrixData);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void reload();
    const t = setInterval(reload, 30_000);
    return () => clearInterval(t);
  }, [reload]);

  // 点击弹层外部关闭
  useEffect(() => {
    if (!pop) return;
    const onDown = (e: MouseEvent): void => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setPop(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pop]);

  async function runAction(fn: () => Promise<unknown>, okMsg: string): Promise<void> {
    setBusy(true);
    try {
      await fn();
      toast.success(okMsg);
      setPop(null);
      await reload();
    } catch (e) {
      toast.error(`失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="text-change-up text-sm">矩阵加载失败: {error}</div>;
  if (!data) return <div className="text-muted-foreground text-sm">加载中...</div>;

  const today = data.days[data.days.length - 1];

  const openCellPop = (
    e: React.MouseEvent,
    job: PopTarget["job"],
    date: string,
    cell: MatrixCell | null,
  ): void => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPop({
      kind: "cell",
      job,
      date,
      cell,
      anchor: { x: rect.left + rect.width / 2, y: rect.bottom },
    });
  };

  const renderCell = (
    row: DatedRow | { job: typeof KS_HISTORY; label: string; backfill?: null },
    date: string,
  ): React.JSX.Element => {
    const cell = data.cells[row.job]?.[date] ?? null;
    const isToday = date === today;
    const base =
      "h-9 min-w-[72px] cursor-pointer rounded-lg text-center align-middle text-[11px] transition-transform hover:scale-105";
    if (!cell) {
      // 字节系数据日 = 次日采集，今天没记录属正常；显示中性「未到」
      const label = isToday && row.job !== KS_HISTORY ? "未到" : "—";
      return (
        <td
          key={date}
          onClick={(e) => openCellPop(e, row, date, null)}
          className={`${base} bg-slate-100/70 text-slate-300`}
          title={isToday ? "数据日通常次日采集" : "无记录 · 点击补跑"}
        >
          {label}
        </td>
      );
    }
    if (cell.state === "ok") {
      return (
        <td
          key={date}
          onClick={(e) => openCellPop(e, row, date, cell)}
          className={`${base} bg-emerald-50 text-emerald-700`}
          title={`${formatOutputSummary(cell.output)}${cell.durS != null ? ` · 耗时 ${cell.durS}s` : ""}${cell.time ? ` · ${cell.time}` : ""}`}
        >
          <span className="font-semibold">{formatOutputSummary(cell.output)}</span>
        </td>
      );
    }
    if (cell.state === "run") {
      return (
        <td key={date} className={`${base} bg-blue-50 font-medium text-blue-600`}>
          ▶ 运行中
        </td>
      );
    }
    if (cell.state === "queue") {
      return (
        <td key={date} className={`${base} bg-slate-100 text-slate-500`}>
          排队中
        </td>
      );
    }
    return (
      <td
        key={date}
        onClick={(e) => openCellPop(e, row, date, cell)}
        className={`${base} bg-red-50 font-bold text-red-600`}
        title={cell.err ?? "失败"}
      >
        ✗{cell.attempt && cell.attempt > 1 ? ` ×${cell.attempt}` : ""}
      </td>
    );
  };

  // 弹层动作：按行类型决定重跑方式
  const popActions = (): React.JSX.Element | null => {
    if (!pop?.job) return null;
    const { job, date } = pop;
    if (job.job === KS_HISTORY) {
      return (
        <button
          disabled={busy}
          onClick={() =>
            runAction(
              () => triggerKuaishouSync({ type: "history", fromDate: date, toDate: date }),
              `快手历史直播 ${date} 已入队`,
            )
          }
          className="w-full rounded-md bg-blue-500 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
        >
          {busy ? "入队中..." : "重跑这一天"}
        </button>
      );
    }
    const dated = job as DatedRow;
    if (dated.backfill) {
      const bf = dated.backfill;
      return (
        <button
          disabled={busy}
          onClick={() =>
            runAction(
              () => backfillRange({ job: bf, from: date, to: date, basecamp: "cs" }),
              `${dated.label} ${date} 已入队`,
            )
          }
          className="w-full rounded-md bg-blue-500 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
        >
          {busy ? "入队中..." : "重跑这一天"}
        </button>
      );
    }
    return (
      <div className="space-y-1.5">
        <p className="text-[11px] text-slate-400">推广游戏不支持单独重跑，只能整天全量重跑</p>
        <button
          disabled={busy}
          onClick={() =>
            runAction(() => rerunCrawl({ date, basecamp: "cs" }), `整天全量重跑 ${date} 已入队`)
          }
          className="w-full rounded-md bg-blue-500 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
        >
          {busy ? "入队中..." : "整天全量重跑"}
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* 健康条 */}
      <div className="flex flex-wrap items-center gap-2">
        {data.cookies.map((c) => {
          const ok = c.status === "active";
          return (
            <span
              key={c.basecamp}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs ${
                ok ? "border-border bg-card" : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`} />
              {COOKIE_NAME[c.basecamp] ?? c.basecamp}
              <span className="text-muted-foreground">
                {ok ? (c.expiresAt ? `有效 · ${c.expiresAt.slice(5, 10)} 过期` : "有效") : "已过期"}
              </span>
            </span>
          );
        })}
        {data.fail24h > 0 && (
          <span className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3.5 py-1.5 text-xs text-red-700">
            <span className="h-2 w-2 rounded-full bg-red-500" />近 24h 失败 {data.fail24h} 个
          </span>
        )}
        <span className="text-muted-foreground ml-auto text-xs">30 秒自动刷新</span>
      </div>

      {/* 矩阵 */}
      <div className="bg-card rounded-lg border p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            近 7 天采集结果{" "}
            <span className="text-muted-foreground text-xs font-normal">
              · 点格子重跑单项，点日期整天重跑
            </span>
          </h3>
          <button
            onClick={() => setShowBackfill((v) => !v)}
            className="text-xs text-blue-600 hover:underline"
          >
            补更早范围 ▾
          </button>
        </div>

        {showBackfill && <BackfillForm onDone={reload} />}

        <table className="w-full border-separate border-spacing-[3px] tabular-nums">
          <thead>
            <tr>
              <th className="min-w-[120px]"></th>
              {data.days.map((d) => {
                const { wd, md } = fmtDay(d);
                const isToday = d === today;
                return (
                  <th
                    key={d}
                    onClick={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setPop({
                        kind: "day",
                        date: d,
                        cell: null,
                        anchor: { x: rect.left + rect.width / 2, y: rect.bottom },
                      });
                    }}
                    className={`cursor-pointer rounded-lg px-1.5 py-1 text-center text-xs font-medium hover:bg-blue-50 ${
                      isToday ? "font-bold text-blue-600" : "text-slate-500"
                    }`}
                    title="整天全量重跑（抖音流水线）"
                  >
                    <span className="block text-[10px] text-slate-300">
                      {isToday ? "今天" : wd}
                    </span>
                    {md}
                  </th>
                );
              })}
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={9} className="pt-1.5 text-[11px] font-bold tracking-wide text-blue-600">
                抖音 · 百应
              </td>
            </tr>
            {BYTE_ROWS.map((row) => (
              <tr key={row.job}>
                <td className="whitespace-nowrap pr-3 text-xs text-slate-600">{row.label}</td>
                {data.days.map((d) => renderCell(row, d))}
                <td></td>
              </tr>
            ))}
            <tr>
              <td
                colSpan={9}
                className="pt-2.5 text-[11px] font-bold tracking-wide text-orange-600"
              >
                快手
              </td>
            </tr>
            <tr>
              <td className="whitespace-nowrap pr-3 text-xs text-slate-600">历史直播</td>
              {data.days.map((d) => renderCell({ job: KS_HISTORY, label: "快手历史直播" }, d))}
              <td></td>
            </tr>
            {DATELESS_ROWS.map((row) => {
              const run = data.dateless[row.job];
              return (
                <tr key={row.job}>
                  <td className="whitespace-nowrap pr-3 text-xs text-slate-600">
                    {row.label} <span className="text-[10px] text-slate-300">{row.freq}</span>
                  </td>
                  <td colSpan={6} className="pr-2 text-right text-[11px] text-slate-400">
                    {run
                      ? `最近 ${run.time ? new Date(run.time).toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" }) : "—"} · ${run.state === "ok" ? formatOutputSummary(run.output) : run.state === "fail" ? `失败 ${run.err ?? ""}` : "运行中"} →`
                      : "近 7 天无记录 →"}
                  </td>
                  <td
                    className={`h-9 min-w-[72px] rounded-lg text-center align-middle text-[11px] ${
                      run?.state === "fail"
                        ? "bg-red-50 font-bold text-red-600"
                        : run
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100/70 text-slate-300"
                    }`}
                  >
                    {run?.state === "fail" ? "✗" : run ? "✓" : "—"}
                  </td>
                  <td className="pl-1">
                    {row.trigger && (
                      <button
                        disabled={busy}
                        onClick={() => {
                          const t = row.trigger;
                          if (!t) return;
                          void runAction(
                            () => triggerKuaishouSync({ type: t }),
                            `${row.label}已入队`,
                          );
                        }}
                        className="whitespace-nowrap rounded-md border border-blue-200 bg-blue-50/60 px-2.5 py-1 text-[11px] text-blue-600 hover:bg-blue-100"
                      >
                        立即同步
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded bg-emerald-50 ring-1 ring-emerald-200" />
            成功（数字 = 入库行数）
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded bg-red-50 ring-1 ring-red-200" />
            失败（点击重跑）
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded bg-slate-100 ring-1 ring-slate-200" />
            无记录（点击补跑）
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded bg-blue-50 ring-1 ring-blue-200" />
            运行中
          </span>
        </div>
      </div>

      {/* 格子/列头点击弹层 */}
      {pop && (
        <div
          ref={popRef}
          style={{
            position: "fixed",
            left: pop.anchor.x,
            top: pop.anchor.y + 6,
            transform: "translateX(-50%)",
            zIndex: 50,
          }}
          className="w-[230px] rounded-xl border border-border bg-white p-3 shadow-2xl"
        >
          {pop.kind === "day" ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700">整天全量重跑 · {pop.date}</p>
              <p className="text-[11px] text-slate-400">
                触发抖音流水线（就绪检查 → 档案 / 日报 / 肖像 / 游戏 / 小游戏）
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  runAction(
                    () => rerunCrawl({ date: pop.date, basecamp: "cs" }),
                    `整天重跑 ${pop.date} 已入队`,
                  )
                }
                className="w-full rounded-md bg-blue-500 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
              >
                {busy ? "入队中..." : "确认重跑"}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700">
                {pop.job?.label} · {pop.date}
              </p>
              {pop.cell?.err && (
                <p className="break-all rounded-md bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
                  {pop.cell.err}
                </p>
              )}
              {pop.cell?.state === "ok" && (
                <p className="text-[11px] text-slate-400">
                  {formatOutputSummary(pop.cell.output)}
                  {pop.cell.durS != null ? ` · 耗时 ${pop.cell.durS}s` : ""}
                  {pop.cell.time ? ` · ${pop.cell.time} 完成` : ""}
                </p>
              )}
              {popActions()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 补更早范围（矩阵 7 天覆盖不到的历史，保留原 backfillRange 能力） */
function BackfillForm({ onDone }: { onDone: () => Promise<void> }): React.JSX.Element {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const [job, setJob] = useState<BackfillJob | "ks_history" | "ks_gift">("daily");
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-slate-50/60 px-3 py-2.5">
      <select
        value={job}
        onChange={(e) => setJob(e.target.value as BackfillJob | "ks_history" | "ks_gift")}
        className="bg-card h-8 rounded border border-input px-2 text-xs"
      >
        <option value="daily">主播日报</option>
        <option value="profile">主播档案</option>
        <option value="portrait">主播肖像</option>
        <option value="minigame">小游戏</option>
        <option value="ks_history">快手·历史直播</option>
        <option value="ks_gift">快手·补礼物数据（流水分时）</option>
      </select>
      <input
        type="date"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        className="bg-card h-8 rounded border border-input px-2 text-xs"
      />
      <span className="text-muted-foreground text-xs">~</span>
      <input
        type="date"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        className="bg-card h-8 rounded border border-input px-2 text-xs"
      />
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            if (job === "ks_history") {
              await triggerKuaishouSync({ type: "history", fromDate: from, toDate: to });
              toast.success(`快手历史直播 ${from} ~ ${to} 已入队`);
            } else if (job === "ks_gift") {
              await triggerKuaishouSync({ type: "gift", fromDate: from, toDate: to });
              toast.success(`快手补礼物数据 ${from} ~ ${to} 已入队（需先有历史直播场次）`);
            } else {
              const r = await backfillRange({ job, from, to, basecamp: "cs" });
              toast.success(`已入队 ${r.days} 天（${from} ~ ${to}）`);
            }
            await onDone();
          } catch (e) {
            toast.error(`失败：${(e as Error).message}`);
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-md bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
      >
        {busy ? "入队中..." : "批量入队"}
      </button>
    </div>
  );
}
