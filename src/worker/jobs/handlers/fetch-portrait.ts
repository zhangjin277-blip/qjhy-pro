import { db } from "@/db/client";
import { anchor_portrait_daily, anchor_daily } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { openDouyinPage, CookieExpiredError } from "@/lib/puppeteer";
import { getActiveCookies, markCookieExpired, notifyCrawlerError } from "@/modules/crawler/server";
import {
  fetchPortraitCoreForAnchor,
  parsePortraitCoreResponse,
} from "@/modules/crawler/adapters/portrait-core";
import type { FetchPerAnchorPayload } from "@/modules/crawler/server";

// 实施时换成抓到的真实 cid
const PORTRAIT_CORE_CID = process.env.DOUYIN_PORTRAIT_CORE_CID ?? "";

export async function fetchPortraitHandler(payload: FetchPerAnchorPayload): Promise<void> {
  if (!PORTRAIT_CORE_CID) {
    console.warn("[fetch-portrait] DOUYIN_PORTRAIT_CORE_CID not set, skipping");
    return;
  }
  const { anchor_id, date, basecamp } = payload;

  const [d] = await db
    .select({ live: anchor_daily.live_duration_1d })
    .from(anchor_daily)
    .where(and(eq(anchor_daily.anchor_id, anchor_id), eq(anchor_daily.date, date)));
  if (!d || !d.live || Number(d.live) === 0) return;

  const cookies = await getActiveCookies(basecamp);
  const page = await openDouyinPage(cookies);
  try {
    const data = await fetchPortraitCoreForAnchor(page, anchor_id, date, PORTRAIT_CORE_CID);
    const row = parsePortraitCoreResponse(data, anchor_id, date);
    // numeric 列 Drizzle 期望 string
    const dbRow = {
      ...row,
      enter_ratio: row.enter_ratio != null ? String(row.enter_ratio) : null,
      pay_ratio: row.pay_ratio != null ? String(row.pay_ratio) : null,
      synced_at: new Date(),
    };
    await db
      .insert(anchor_portrait_daily)
      .values(dbRow)
      .onConflictDoUpdate({
        target: [anchor_portrait_daily.anchor_id, anchor_portrait_daily.date],
        set: { ...dbRow, synced_at: new Date() },
      });
  } catch (e) {
    if (e instanceof CookieExpiredError) {
      await markCookieExpired(basecamp);
      await notifyCrawlerError({ type: "cookie_expired", detail: e.message });
    } else {
      await notifyCrawlerError({
        type: "job_failed",
        detail: `fetch-portrait(${anchor_id}) failed: ${(e as Error).message}`,
      });
    }
    throw e;
  } finally {
    await page.close();
  }
}
