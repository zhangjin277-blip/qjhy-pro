import { db } from "@/db/client";
import { session_minigame_convert } from "@/db/schema";
import { openDouyinPage, CookieExpiredError } from "@/lib/puppeteer";
import { getActiveCookies, markCookieExpired, notifyCrawlerError } from "@/modules/crawler/server";
import {
  fetchSessionMinigame,
  parseSessionMinigameResponse,
} from "@/modules/crawler/adapters/session-minigame";
import type { FetchSessionMgPayload } from "@/modules/crawler/server";

export async function fetchSessionMgHandler(payload: FetchSessionMgPayload): Promise<void> {
  const { room_id, anchor_id, basecamp } = payload;
  const cookies = await getActiveCookies(basecamp);
  const page = await openDouyinPage(cookies);
  try {
    const { overview, convert } = await fetchSessionMinigame(page, room_id);
    // 简化：场次日期取采集当日，实际应从 overview.create_time 反推
    const date = new Date().toISOString().slice(0, 10);
    const row = parseSessionMinigameResponse(overview, convert, room_id, anchor_id, date);
    // numeric 列（*_per fields）Drizzle 期望 string
    const dbRow = {
      ...row,
      not_open_show_per: row.not_open_show_per != null ? String(row.not_open_show_per) : null,
      not_open_click_per: row.not_open_click_per != null ? String(row.not_open_click_per) : null,
      not_open_pay_per: row.not_open_pay_per != null ? String(row.not_open_pay_per) : null,
      open_game_click_per: row.open_game_click_per != null ? String(row.open_game_click_per) : null,
      open_game_pay_per: row.open_game_pay_per != null ? String(row.open_game_pay_per) : null,
      synced_at: new Date(),
    };
    await db
      .insert(session_minigame_convert)
      .values(dbRow)
      .onConflictDoUpdate({
        target: session_minigame_convert.room_id,
        set: { ...dbRow, synced_at: new Date() },
      });
  } catch (e) {
    if (e instanceof CookieExpiredError) {
      await markCookieExpired(basecamp);
      await notifyCrawlerError({ type: "cookie_expired", detail: e.message });
    } else {
      await notifyCrawlerError({
        type: "job_failed",
        detail: `fetch-session-mg(${room_id}) failed: ${(e as Error).message}`,
      });
    }
    throw e;
  } finally {
    await page.close();
  }
}
