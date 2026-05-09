import { db } from "@/db/client";
import { anchor_game_promo_daily, anchor_profile } from "@/db/schema";
import { eq } from "drizzle-orm";
import { openDouyinPage, CookieExpiredError } from "@/lib/puppeteer";
import { getActiveCookies, markCookieExpired, notifyCrawlerError } from "@/modules/crawler/server";
import { fetchAllGamePromo, parseGamePromoRow } from "@/modules/crawler/adapters/game-promo";
import type { FetchSimplePayload } from "@/modules/crawler/server";

/**
 * Batch 模式：用 download API 一次性拉所有斗地主主播的 4 个 task
 * (live cps + live cps_all + video cps + video cps_all)
 * 然后通过抖音号反查 anchor_id 入库。
 */
export interface FetchGameResult {
  rows: number;
  unmatched: number;
}

export async function fetchGameHandler(payload: FetchSimplePayload): Promise<FetchGameResult> {
  const { date, basecamp } = payload;

  // 抖音号 → anchor_id 映射（仅非三国主播）
  const profiles = await db
    .select({
      anchor_id: anchor_profile.anchor_id,
      aweme_short_id: anchor_profile.aweme_short_id,
      aweme_display_id: anchor_profile.aweme_display_id,
    })
    .from(anchor_profile)
    .where(eq(anchor_profile.is_threekingdoms, false));
  const awemeToAnchor = new Map<string, string>();
  for (const p of profiles) {
    if (p.aweme_short_id) awemeToAnchor.set(p.aweme_short_id, p.anchor_id);
    if (p.aweme_display_id) awemeToAnchor.set(p.aweme_display_id, p.anchor_id);
  }
  console.log(`[fetch-game] aweme→anchor map size=${awemeToAnchor.size}`);

  const cookies = await getActiveCookies(basecamp);
  const page = await openDouyinPage(cookies);

  try {
    const results = await fetchAllGamePromo(page, date);

    let total = 0;
    let unmatched = 0;
    for (const result of results) {
      console.log(`[fetch-game] ${result.scene}+${result.bizMode}: ${result.rows.length} CSV rows`);
      for (const r of result.rows) {
        const parsed = parseGamePromoRow(r, result.scene, result.bizMode, date);
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
          // integer 列防小数（平台 CSV 偶有 float）
          acu: i(rowData.acu),
          pcu: i(rowData.pcu),
          promote_live_cnt_1d: i(rowData.promote_live_cnt_1d),
          promote_live_watch_ucnt_1d: i(rowData.promote_live_watch_ucnt_1d),
          promote_live_like_ucnt_1d: i(rowData.promote_live_like_ucnt_1d),
          promote_live_comment_ucnt_1d: i(rowData.promote_live_comment_ucnt_1d),
          promote_live_follow_ucnt_1d: i(rowData.promote_live_follow_ucnt_1d),
          promote_video_publish_cnt_1d: i(rowData.promote_video_publish_cnt_1d),
          promote_item_uv_1d: i(rowData.promote_item_uv_1d),
          promote_click_download_ucnt_1d: i(rowData.promote_click_download_ucnt_1d),
          promote_start_download_ucnt_1d: i(rowData.promote_start_download_ucnt_1d),
          promote_download_finish_ucnt_1d: i(rowData.promote_download_finish_ucnt_1d),
          promote_install_finish_ucnt_1d: i(rowData.promote_install_finish_ucnt_1d),
          promote_active_ucnt_1d: i(rowData.promote_active_ucnt_1d),
          promote_pay_ucnt_1d: i(rowData.promote_pay_ucnt_1d),
          promote_charge_pay_ucnt_1d: i(rowData.promote_charge_pay_ucnt_1d),
          promote_download_pay_ucnt_1d: i(rowData.promote_download_pay_ucnt_1d),
          promote_active_pay_ucnt_1d: i(rowData.promote_active_pay_ucnt_1d),
          promote_finish_play_ucnt_1d: i(rowData.promote_finish_play_ucnt_1d),
          // bigint 列防小数
          promote_item_vv_1d: i(rowData.promote_item_vv_1d),
          promote_pay_amount_1d: i(rowData.promote_pay_amount_1d),
          props_pay_amount_1d: i(rowData.props_pay_amount_1d),
          props_anchor_pay_amount_1d: i(rowData.props_anchor_pay_amount_1d),
          props_faction_pay_amount_1d: i(rowData.props_faction_pay_amount_1d),
          promote_anchor_income_1d: i(rowData.promote_anchor_income_1d),
          promote_faction_income_1d: i(rowData.promote_faction_income_1d),
          promote_download_pay_amount_1d: i(rowData.promote_download_pay_amount_1d),
          promote_anchor_download_pay_amount_1d: i(rowData.promote_anchor_download_pay_amount_1d),
          promote_faction_download_pay_amount_1d: i(rowData.promote_faction_download_pay_amount_1d),
          promote_anchor_active_pay_amount_1d: i(rowData.promote_anchor_active_pay_amount_1d),
          promote_faction_active_pay_amount_1d: i(rowData.promote_faction_active_pay_amount_1d),
          // numeric 列：转 string
          promote_live_duration_1d: s(rowData.promote_live_duration_1d),
          promote_live_duration_avg: s(rowData.promote_live_duration_avg),
          promote_live_watch_duration_1d: s(rowData.promote_live_watch_duration_1d),
          promote_live_watch_duration_uavg_1d: s(rowData.promote_live_watch_duration_uavg_1d),
          promote_live_like_uavg_1d: s(rowData.promote_live_like_uavg_1d),
          promote_live_comment_uavg_1d: s(rowData.promote_live_comment_uavg_1d),
          promote_live_follow_uavg_1d: s(rowData.promote_live_follow_uavg_1d),
          promote_item_uavg_1d: s(rowData.promote_item_uavg_1d),
          promote_finish_play_ratio_1d: s(rowData.promote_finish_play_ratio_1d),
          synced_at: new Date(),
        };
        await db
          .insert(anchor_game_promo_daily)
          .values(dbRow)
          .onConflictDoUpdate({
            target: [
              anchor_game_promo_daily.anchor_id,
              anchor_game_promo_daily.date,
              anchor_game_promo_daily.promote_scene,
              anchor_game_promo_daily.biz_mode,
              anchor_game_promo_daily.game_name,
            ],
            set: dbRow,
          });
        total++;
      }
    }
    console.log(`[fetch-game] done: ${total} rows synced, ${unmatched} unmatched (date=${date})`);
    return { rows: total, unmatched };
  } catch (e) {
    if (e instanceof CookieExpiredError) {
      await markCookieExpired(basecamp);
      await notifyCrawlerError({ type: "cookie_expired", detail: e.message });
    } else {
      await notifyCrawlerError({
        type: "job_failed",
        detail: `fetch-game batch failed: ${(e as Error).message}`,
      });
    }
    throw e;
  } finally {
    await page.close();
  }
}
