import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-guard";

/**
 * 采集矩阵数据：近 7 天「任务 × 数据日期」格子 + 无日期任务最近一次运行 + Cookie 健康。
 *
 * 数据源 = pgboss.job ∪ pgboss.archive（archive 保留 ~7 天，刚好覆盖矩阵窗口）。
 * 日期语义 = 数据日期（job.data 里的 date / fromDate~toDate），不是运行时间：
 *   - 字节系 job 带 data.date
 *   - 快手历史直播：手动触发带 fromDate~toDate（按天展开）；cron 触发不带参数，
 *     handler 默认拉 [前天, 昨天]，按 completed_on 推回这两天
 *   - 成员同步 / 今日实时 / 直播趋势快照 / 视频快照：无日期 → 只报最近一次运行
 */

interface RawRow extends Record<string, unknown> {
  name: string;
  date: string | null;
  from_date: string | null;
  to_date: string | null;
  state: string;
  attempt: number | null;
  created_on: string;
  completed_on: string | null;
  completed_cst: string | null; // completed_on 上海时区 YYYY-MM-DD
  dur_s: number | null;
  err: string | null;
  output: Record<string, unknown> | null;
}

export interface MatrixCell {
  state: "ok" | "fail" | "run" | "queue";
  output: Record<string, unknown> | null;
  err: string | null;
  attempt: number | null;
  durS: number | null;
  time: string | null; // 完成时间 HH:mm
}

export interface DatelessRun {
  state: "ok" | "fail" | "run" | "queue";
  output: Record<string, unknown> | null;
  err: string | null;
  time: string | null; // 完成/创建时间 ISO
}

export interface CookieHealth {
  basecamp: string;
  status: string;
  expiresAt: string | null;
  lastCheckAt: string | null;
}

function cellState(state: string): MatrixCell["state"] {
  if (state === "completed") return "ok";
  if (state === "active") return "run";
  if (state === "created" || state === "retry") return "queue";
  return "fail"; // failed / cancelled / expired
}

function shiftDate(ymd: string, deltaDays: number): string {
  const t = new Date(`${ymd}T00:00:00Z`).getTime() + deltaDays * 86400_000;
  return new Date(t).toISOString().slice(0, 10);
}

function hhmm(ts: string | null): string | null {
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai",
  });
}

const DATED_JOBS = new Set([
  "crawler:fetch_daily",
  "crawler:fetch_profile",
  "crawler:fetch_portrait",
  "crawler:fetch_minigame",
  "crawler:fetch_game",
]);
const KS_HISTORY = "crawler:sync_kuaishou_history_live";
const DATELESS_JOBS = new Set([
  "crawler:sync_kuaishou_members",
  "crawler:sync_kuaishou_today_live",
  "crawler:sync_kuaishou_live_snapshot",
  "crawler:fetch_video",
]);

export async function GET(): Promise<NextResponse> {
  await requireAdmin();

  const rows = (await db.execute<RawRow>(sql`
    WITH all_jobs AS (
      SELECT name, data, state, created_on, completed_on, started_on, output
      FROM pgboss.job WHERE name LIKE 'crawler:%' AND created_on > now() - interval '9 days'
      UNION ALL
      SELECT name, data, state, created_on, completed_on, started_on, output
      FROM pgboss.archive WHERE name LIKE 'crawler:%' AND created_on > now() - interval '9 days'
    )
    SELECT
      name,
      data->>'date' AS date,
      data->>'fromDate' AS from_date,
      data->>'toDate' AS to_date,
      state,
      (data->>'attempt')::int AS attempt,
      created_on::text AS created_on,
      completed_on::text AS completed_on,
      to_char(completed_on AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS completed_cst,
      EXTRACT(EPOCH FROM (completed_on - started_on))::int AS dur_s,
      output->>'error' AS err,
      CASE WHEN state = 'completed' THEN output ELSE NULL END AS output
    FROM all_jobs
    ORDER BY created_on ASC
  `)) as unknown as RawRow[];

  // 近 7 天（上海时区），今天在最后
  const todayCst = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) days.push(shiftDate(todayCst, -i));
  const daySet = new Set(days);

  // created_on 升序遍历，后写覆盖先写 → 每格留最新一次运行
  const cells: Record<string, Record<string, MatrixCell>> = {};
  const dateless: Record<string, DatelessRun> = {};

  const putCell = (job: string, date: string, r: RawRow): void => {
    if (!daySet.has(date)) return;
    (cells[job] ??= {})[date] = {
      state: cellState(r.state),
      output: r.output,
      err: r.err,
      attempt: r.attempt,
      durS: r.dur_s,
      time: hhmm(r.completed_on),
    };
  };

  for (const r of rows) {
    if (DATED_JOBS.has(r.name)) {
      if (r.date) putCell(r.name, r.date, r);
    } else if (r.name === KS_HISTORY) {
      if (r.from_date && r.to_date) {
        for (let d = r.from_date; d <= r.to_date; d = shiftDate(d, 1)) putCell(r.name, d, r);
      } else if (r.completed_cst) {
        // cron 默认窗口 [前天, 昨天]（相对运行日）
        putCell(r.name, shiftDate(r.completed_cst, -2), r);
        putCell(r.name, shiftDate(r.completed_cst, -1), r);
      }
    } else if (DATELESS_JOBS.has(r.name)) {
      dateless[r.name] = {
        state: cellState(r.state),
        output: r.output,
        err: r.err,
        time: r.completed_on ?? r.created_on,
      };
    }
  }

  // 近 24h 失败数（含已 archive 的）
  const fail24h = rows.filter(
    (r) =>
      (r.state === "failed" || r.state === "expired") &&
      new Date(r.created_on).getTime() > Date.now() - 86400_000,
  ).length;

  // Cookie 健康
  const cookieRows = (await db.execute<Record<string, unknown>>(sql`
    SELECT basecamp, status, expires_at::text AS expires_at, last_check_at::text AS last_check_at
    FROM crawler_cookie_session ORDER BY basecamp
  `)) as unknown as {
    basecamp: string;
    status: string;
    expires_at: string | null;
    last_check_at: string | null;
  }[];
  const cookies: CookieHealth[] = cookieRows.map((c) => ({
    basecamp: c.basecamp,
    status: c.status,
    expiresAt: c.expires_at,
    lastCheckAt: c.last_check_at,
  }));

  return NextResponse.json({ days, cells, dateless, cookies, fail24h });
}
