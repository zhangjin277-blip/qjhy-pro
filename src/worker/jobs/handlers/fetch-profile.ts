import { db } from "@/db/client";
import { anchor_profile } from "@/db/schema";
// Worker intentionally imports the server-side sync helper directly; importing the
// module barrel would also load Server Actions and authz into the worker bundle.
// eslint-disable-next-line import/no-restricted-paths
import { syncRecruitmentDatesFromAnchorProfiles } from "@/modules/business-recruitment/auto-match";
import { openDouyinPage, CookieExpiredError } from "@/lib/puppeteer";
import {
  getActiveCookies,
  markCookieExpired,
  notifyCrawlerError,
  fetchAnchorList,
  parseAnchorListResponse,
  type FetchSimplePayload,
} from "@/modules/crawler/server";

export interface FetchProfileResult {
  rows: number;
}

export async function fetchProfileHandler(
  payload: FetchSimplePayload,
): Promise<FetchProfileResult> {
  const { basecamp } = payload;
  let cookies: Record<string, string>;
  try {
    cookies = await getActiveCookies(basecamp);
  } catch (e) {
    await notifyCrawlerError({
      type: "cookie_expired",
      detail: `No active cookie for ${basecamp}: ${(e as Error).message}`,
      action: "Admin 扫码续期",
    });
    throw e;
  }

  const page = await openDouyinPage(cookies);
  try {
    const list = await fetchAnchorList(page);
    const fakeRaw = { status_code: 0, data: { list, total_amount: list.length } };
    const rows = parseAnchorListResponse(fakeRaw);

    // 全量 upsert
    for (const row of rows) {
      // numeric 列 Drizzle 期望 string，将 number | null 序列化
      const dbRow = {
        ...row,
        income_percent: row.income_percent != null ? String(row.income_percent) : null,
        synced_at: new Date(),
        updated_at: new Date(),
      };
      await db.insert(anchor_profile).values(dbRow).onConflictDoUpdate({
        target: anchor_profile.anchor_id,
        set: dbRow,
      });
    }
    // 主播档案更新后，精确按抖音号/UID 补齐商务招募的日期字段。
    // 该同步只填空值，人工确认过的日期不会被覆盖。
    const recruitmentSync = await syncRecruitmentDatesFromAnchorProfiles();
    if (recruitmentSync.matched > 0 || recruitmentSync.conflicts > 0) {
      console.log("[fetch-profile] recruitment dates", recruitmentSync);
    }
    console.log(`[fetch-profile] synced ${rows.length} anchors for ${basecamp}`);
    return { rows: rows.length };
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
        detail: `fetch-profile failed: ${(e as Error).message}`,
      });
    }
    throw e;
  } finally {
    await page.close();
  }
}
