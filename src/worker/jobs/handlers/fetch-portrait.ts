import { db } from "@/db/client";
import { anchor_portrait_daily, anchor_daily } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { openDouyinPage, CookieExpiredError } from "@/lib/puppeteer";
import { getActiveCookies, markCookieExpired, notifyCrawlerError } from "@/modules/crawler/server";
import {
  fetchPortraitCoreForAnchor,
  parsePortraitCoreResponse,
} from "@/modules/crawler/adapters/portrait-core";
import type { FetchSimplePayload } from "@/modules/crawler/server";

/**
 * Batch 模式拉 portrait：一次启 puppeteer，对当日开播的所有主播循环 fetch。
 * 一个 anchor ~1s，1591 anchor 约 30 分钟。
 * 比 per-anchor pg-boss job 节省 1591 次 page launch + setCookie + navigate 开销（每次约 10s）。
 */
export interface FetchPortraitResult {
  rows: number;
  fail: number;
  total: number;
}

export async function fetchPortraitHandler(
  payload: FetchSimplePayload,
): Promise<FetchPortraitResult> {
  const { date, basecamp } = payload;

  // 取当日开播的主播
  const liveAnchors = await db
    .select({ anchor_id: anchor_daily.anchor_id })
    .from(anchor_daily)
    .where(and(eq(anchor_daily.date, date), gt(anchor_daily.live_duration_1d, "0")));
  if (liveAnchors.length === 0) {
    console.log(`[fetch-portrait] no live anchors for ${date}`);
    return { rows: 0, fail: 0, total: 0 };
  }
  console.log(`[fetch-portrait] ${liveAnchors.length} anchors to fetch for ${date}`);

  const cookies = await getActiveCookies(basecamp);
  const page = await openDouyinPage(cookies);
  let success = 0;
  let fail = 0;

  try {
    for (const { anchor_id } of liveAnchors) {
      try {
        const list = await fetchPortraitCoreForAnchor(page, anchor_id, date);
        if (list.length === 0) {
          fail++;
          continue;
        }
        const row = parsePortraitCoreResponse(list, anchor_id, date);
        const s = (n: number | null): string | null => (n != null ? String(n) : null);
        const dbRow = {
          ...row,
          enter_room_rate: s(row.enter_room_rate),
          avg_watch_duration: s(row.avg_watch_duration),
          consume_rate: s(row.consume_rate),
          synced_at: new Date(),
        };
        await db
          .insert(anchor_portrait_daily)
          .values(dbRow)
          .onConflictDoUpdate({
            target: [anchor_portrait_daily.anchor_id, anchor_portrait_daily.date],
            set: dbRow,
          });
        success++;
        if (success % 100 === 0) {
          console.log(`[fetch-portrait] ${success}/${liveAnchors.length} synced`);
        }
        await new Promise((r) => setTimeout(r, 200)); // 防限流
      } catch (e) {
        if (e instanceof CookieExpiredError) throw e;
        fail++;
        if (fail < 5) {
          console.warn(`[fetch-portrait] ${anchor_id} failed: ${(e as Error).message}`);
        }
      }
    }
    console.log(`[fetch-portrait] done: ${success} success, ${fail} fail (date=${date})`);
    return { rows: success, fail, total: liveAnchors.length };
  } catch (e) {
    if (e instanceof CookieExpiredError) {
      await markCookieExpired(basecamp);
      await notifyCrawlerError({ type: "cookie_expired", detail: e.message });
    } else {
      await notifyCrawlerError({
        type: "job_failed",
        detail: `fetch-portrait batch failed: ${(e as Error).message}`,
      });
    }
    throw e;
  } finally {
    await page.close();
  }
}
