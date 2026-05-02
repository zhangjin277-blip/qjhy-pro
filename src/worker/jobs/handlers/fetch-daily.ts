import { db } from "@/db/client";
import { anchor_daily } from "@/db/schema";
import { openDouyinPage, CookieExpiredError } from "@/lib/puppeteer";
import {
  getActiveCookies,
  markCookieExpired,
  notifyCrawlerError,
  enqueue,
  JOB_NAMES,
  fetchAnchorDaily,
  parseAnchorDailyResponse,
} from "@/modules/crawler/server";
import type { FetchSimplePayload } from "@/modules/crawler/server";

export async function fetchDailyHandler(payload: FetchSimplePayload): Promise<void> {
  const { date, basecamp } = payload;
  const cookies = await getActiveCookies(basecamp);
  const page = await openDouyinPage(cookies);
  try {
    // download 模式：触发导出 → 轮询 → 下载 CSV → 解析中文表头
    const csvRows = await fetchAnchorDaily(page, date);
    const rows = parseAnchorDailyResponse(csvRows, date);
    let totalFetched = 0;
    for (const row of rows) {
      if (!row.anchor_id) continue; // CSV 可能含合计行无 ID
      // numeric 列 Drizzle 期望 string
      const dbRow = {
        ...row,
        live_duration_1d: row.live_duration_1d != null ? String(row.live_duration_1d) : null,
        valid_live_duration_1d:
          row.valid_live_duration_1d != null ? String(row.valid_live_duration_1d) : null,
        feed_watch_duration_1d:
          row.feed_watch_duration_1d != null ? String(row.feed_watch_duration_1d) : null,
        current_percent: row.current_percent != null ? String(row.current_percent) : null,
        game_share_percent: row.game_share_percent != null ? String(row.game_share_percent) : null,
        pay_money_connect_share_percent:
          row.pay_money_connect_share_percent != null
            ? String(row.pay_money_connect_share_percent)
            : null,
        profit_share_ratio: row.profit_share_ratio != null ? String(row.profit_share_ratio) : null,
        synced_at: new Date(),
      };
      await db
        .insert(anchor_daily)
        .values(dbRow)
        .onConflictDoUpdate({
          target: [anchor_daily.anchor_id, anchor_daily.date],
          set: dbRow,
        });
      totalFetched++;
    }
    console.log(`[fetch-daily] synced ${totalFetched} rows for ${date}`);

    // 触发下游 per-anchor jobs
    await enqueueDownstream(date, basecamp);
  } catch (e) {
    if (e instanceof CookieExpiredError) {
      await markCookieExpired(basecamp);
      await notifyCrawlerError({
        type: "cookie_expired",
        detail: e.message,
        action: "Admin 扫码续期",
      });
    } else {
      await notifyCrawlerError({
        type: "job_failed",
        detail: `fetch-daily failed: ${(e as Error).message}`,
      });
    }
    throw e;
  } finally {
    await page.close();
  }
}

async function enqueueDownstream(date: string, basecamp: "cs" | "nc1" | "nc2"): Promise<void> {
  // 全部下游 job 改 batch 模式（一次性 download CSV 处理所有主播）
  await enqueue(JOB_NAMES.FETCH_PORTRAIT, { date, basecamp });
  await enqueue(JOB_NAMES.FETCH_GAME, { date, basecamp });
  await enqueue(JOB_NAMES.FETCH_MINIGAME, { date, basecamp });
}
