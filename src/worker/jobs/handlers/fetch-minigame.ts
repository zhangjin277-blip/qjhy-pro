import { db } from "@/db/client";
import { anchor_minigame_daily, anchor_profile } from "@/db/schema";
import { eq } from "drizzle-orm";
import { openDouyinPage, CookieExpiredError } from "@/lib/puppeteer";
import { getActiveCookies, markCookieExpired, notifyCrawlerError } from "@/modules/crawler/server";
import { fetchMinigameLive, parseMinigameRow } from "@/modules/crawler/adapters/minigame-live";
import type { FetchSimplePayload } from "@/modules/crawler/server";

/**
 * Batch 模式：用 download API 一次拉所有三国主播 × 所有小游戏的数据。
 * scene 当前只 live（download endpoint 包含 live 数据，video 需另外探查）。
 */
export async function fetchMinigameHandler(payload: FetchSimplePayload): Promise<void> {
  const { date, basecamp } = payload;

  // 抖音号 → anchor_id 映射（仅三国主播）
  const profiles = await db
    .select({
      anchor_id: anchor_profile.anchor_id,
      aweme_short_id: anchor_profile.aweme_short_id,
      aweme_display_id: anchor_profile.aweme_display_id,
    })
    .from(anchor_profile)
    .where(eq(anchor_profile.is_threekingdoms, true));
  const awemeToAnchor = new Map<string, string>();
  for (const p of profiles) {
    if (p.aweme_short_id) awemeToAnchor.set(p.aweme_short_id, p.anchor_id);
    if (p.aweme_display_id) awemeToAnchor.set(p.aweme_display_id, p.anchor_id);
  }
  console.log(`[fetch-minigame] aweme→anchor map size=${awemeToAnchor.size}`);

  const cookies = await getActiveCookies(basecamp);
  const page = await openDouyinPage(cookies);

  try {
    const csvRows = await fetchMinigameLive(page, date);
    console.log(`[fetch-minigame] CSV rows=${csvRows.length}`);
    if (csvRows.length > 0) {
      console.log(`[fetch-minigame] CSV headers: ${Object.keys(csvRows[0] ?? {}).join(", ")}`);
      console.log(`[fetch-minigame] First row:`, csvRows[0]);
    }

    let total = 0;
    let unmatched = 0;
    for (const r of csvRows) {
      const parsed = parseMinigameRow(r, "live", date);
      const anchorId = parsed._aweme_id ? awemeToAnchor.get(parsed._aweme_id) : null;
      if (!anchorId) {
        unmatched++;
        continue;
      }
      const { _aweme_id: _, ...rowData } = parsed;
      void _;
      const s = (n: number | null): string | null => (n != null ? String(n) : null);
      const i = (n: number | null): number | null => (n != null ? Math.round(n) : null);
      const dbRow = {
        anchor_id: anchorId,
        ...rowData,
        // integer 列：round 防 "81.06" 报错
        acu: i(rowData.acu),
        pcu: i(rowData.pcu),
        live_room_cnt: i(rowData.live_room_cnt),
        watch_ucnt: i(rowData.watch_ucnt),
        like_ucnt: i(rowData.like_ucnt),
        follow_ucnt: i(rowData.follow_ucnt),
        comment_ucnt: i(rowData.comment_ucnt),
        gm_click_ucnt: i(rowData.gm_click_ucnt),
        gm_active_ucnt: i(rowData.gm_active_ucnt),
        gm_pay_ucnt: i(rowData.gm_pay_ucnt),
        cps_bind_uv: i(rowData.cps_bind_uv),
        play_uv: i(rowData.play_uv),
        finish_play_uv: i(rowData.finish_play_uv),
        // bigint 列：CSV 给元值带小数（如 "16.72"），直接 round（精度损失 1 元以内）
        before_divided_income: i(rowData.before_divided_income),
        after_divided_author_income: i(rowData.after_divided_author_income),
        after_divided_trade_union_income: i(rowData.after_divided_trade_union_income),
        play_cnt: i(rowData.play_cnt),
        // numeric 列：转 string
        live_duration: s(rowData.live_duration),
        avg_room_live_duration: s(rowData.avg_room_live_duration),
        avg_user_watch_duration: s(rowData.avg_user_watch_duration),
        watch_duration: s(rowData.watch_duration),
        play_cnt_avg: s(rowData.play_cnt_avg),
        finish_play_ratio: s(rowData.finish_play_ratio),
        like_ucnt_ratio: s(rowData.like_ucnt_ratio),
        follow_ucnt_ratio: s(rowData.follow_ucnt_ratio),
        comment_ucnt_ratio: s(rowData.comment_ucnt_ratio),
        synced_at: new Date(),
      };
      await db
        .insert(anchor_minigame_daily)
        .values(dbRow)
        .onConflictDoUpdate({
          target: [
            anchor_minigame_daily.anchor_id,
            anchor_minigame_daily.date,
            anchor_minigame_daily.scene,
            anchor_minigame_daily.mp_name,
          ],
          set: dbRow,
        });
      total++;
    }
    console.log(`[fetch-minigame] done: ${total} rows synced, ${unmatched} unmatched`);
  } catch (e) {
    if (e instanceof CookieExpiredError) {
      await markCookieExpired(basecamp);
      await notifyCrawlerError({ type: "cookie_expired", detail: e.message });
    } else {
      await notifyCrawlerError({
        type: "job_failed",
        detail: `fetch-minigame batch failed: ${(e as Error).message}`,
      });
    }
    throw e;
  } finally {
    await page.close();
  }
}
