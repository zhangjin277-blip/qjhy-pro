import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { kuaishou_live_trend } from "@/db/schema";
import { CookieExpiredError } from "@/lib/puppeteer";
import {
  getActiveCookies,
  markCookieExpired,
  notifyCrawlerError,
  fetchKuaishouHistoryTrend,
} from "@/modules/crawler/server";

interface Options {
  /** ISO date "YYYY-MM-DD"，默认昨天 - 1 天（覆盖 D-2 ~ D-1）*/
  fromDate?: string;
  toDate?: string;
}

interface BackfillResult {
  fromDate: string;
  toDate: string;
  sessions: number;
  trendPointsUpserted: number;
  failed: number;
}

const REQUEST_DELAY_MS = 120;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * 回补快手历史流水分时到 kuaishou_live_trend（断档期「补礼物数据」）。
 *
 * 背景：开播记录页的「礼物」列 = kuaishou_live_trend 实时累计流水 MAX-MIN。
 * cookie 断档期 ks-trend-sync 没跑 → 那几天 trend 缺失 → 礼物显示「–」。
 * 但 jigou「历史开播直播间 → 详情 → 流水分时图」接口对已结束场次仍返回整场曲线，
 * 故可按 kuaishou_live_session 里的 live_stream_id 逐场回拉补齐。
 *
 * 依赖：先跑 sync-kuaishou-history-live 把该范围场次（含 live_stream_id）落库，
 * 本 job 再据此回补分时。member_id 对齐 live_account.platform_account_id，
 * live_stream_id_str 用数字 id 的字符串形式（每场唯一，满足 checkin 的 GROUP BY 口径）。
 */
export async function backfillKuaishouTrendHandler(opts: Options = {}): Promise<BackfillResult> {
  const yesterday = new Date(Date.now() - 86400_000 + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const dayBeforeYesterday = new Date(Date.now() - 2 * 86400_000 + 8 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const fromDate = opts.fromDate ?? dayBeforeYesterday;
  const toDate = opts.toDate ?? yesterday;

  const startMs = new Date(`${fromDate}T00:00:00+08:00`).getTime();
  const endMs = new Date(`${toDate}T23:59:59.999+08:00`).getTime();

  // 取该范围内已落库的场次（按开播时间归属），逐场回拉分时
  const sessions = await db.execute<{
    id: string;
    member_id: string;
    member_name: string | null;
  }>(sql`
    SELECT live_stream_id::text AS id, member_id, member_name
    FROM kuaishou_live_session
    WHERE start_datetime >= to_timestamp(${startMs / 1000})
      AND start_datetime <= to_timestamp(${endMs / 1000})
    ORDER BY start_datetime
  `);
  const rows = [...sessions];
  console.log(`[ks-gift-backfill] window ${fromDate} ~ ${toDate}: ${rows.length} sessions`);

  const cookies = await getActiveCookies("kuaishou");
  let trendPointsUpserted = 0;
  let failed = 0;

  try {
    for (const r of rows) {
      let points: Awaited<ReturnType<typeof fetchKuaishouHistoryTrend>>;
      try {
        points = await fetchKuaishouHistoryTrend(cookies, Number(r.id));
      } catch (e) {
        if (e instanceof CookieExpiredError) throw e;
        console.warn(`[ks-gift-backfill] trend failed for ${r.id}:`, (e as Error).message);
        failed++;
        continue;
      }
      if (!points || points.length === 0) {
        failed++;
        continue;
      }

      const values = points.map((p) => ({
        live_stream_id_str: r.id,
        member_id: r.member_id,
        member_name: r.member_name,
        ts: new Date(p.ts),
        valid_income_cents: p.income_cents,
        online_count: p.online,
        like_count: p.like,
      }));

      // 累计值理论单调递增，冲突时取 GREATEST 防回落；与 ks-trend-sync 口径一致
      await db
        .insert(kuaishou_live_trend)
        .values(values)
        .onConflictDoUpdate({
          target: [kuaishou_live_trend.live_stream_id_str, kuaishou_live_trend.ts],
          set: {
            valid_income_cents: sql`GREATEST(${kuaishou_live_trend.valid_income_cents}, EXCLUDED.valid_income_cents)`,
            online_count: sql`EXCLUDED.online_count`,
            like_count: sql`GREATEST(${kuaishou_live_trend.like_count}, EXCLUDED.like_count)`,
            fetched_at: sql`now()`,
          },
        });
      trendPointsUpserted += values.length;
      console.log(
        `[ks-gift-backfill] ${r.member_name ?? "?"}/${r.id} upserted ${values.length} pts`,
      );
      await sleep(REQUEST_DELAY_MS);
    }
  } catch (e) {
    if (e instanceof CookieExpiredError) {
      await markCookieExpired("kuaishou");
      await notifyCrawlerError({
        type: "cookie_expired",
        detail: "ks-gift-backfill 触发 cookie 失效",
      });
    }
    throw e;
  }

  // A normal return is recorded as pg-boss `completed`. Do not hide a run
  // where every discovered session failed and no trend row was written.
  if (rows.length > 0 && failed === rows.length && trendPointsUpserted === 0) {
    throw new Error(
      `[ks-gift-backfill] all ${rows.length} sessions failed for ${fromDate} ~ ${toDate}`,
    );
  }

  const result: BackfillResult = {
    fromDate,
    toDate,
    sessions: rows.length,
    trendPointsUpserted,
    failed,
  };
  console.log("[backfill-kuaishou-trend] done", result);
  return result;
}
