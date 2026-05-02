import { db } from "@/db/client";
import { anchor_game_promo_daily, anchor_daily, anchor_profile } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { openDouyinPage, CookieExpiredError } from "@/lib/puppeteer";
import { getActiveCookies, markCookieExpired, notifyCrawlerError } from "@/modules/crawler/server";
import {
  fetchGamePromoForAnchor,
  parseGamePromoResponse,
  type BizMode,
  type PromoteScene,
} from "@/modules/crawler/adapters/game-promo";
import type { FetchPerAnchorPayload } from "@/modules/crawler/server";

const SCENES: PromoteScene[] = ["live", "video"];
const BIZ_MODES: BizMode[] = ["cps_all", "cpc", "poi"];

export async function fetchGameHandler(payload: FetchPerAnchorPayload): Promise<void> {
  const { anchor_id, date, basecamp } = payload;

  // skip 如果不是斗地主或昨日未开播
  const [check] = await db
    .select({
      is_three: anchor_profile.is_threekingdoms,
      live: anchor_daily.live_duration_1d,
    })
    .from(anchor_profile)
    .leftJoin(
      anchor_daily,
      and(eq(anchor_profile.anchor_id, anchor_daily.anchor_id), eq(anchor_daily.date, date)),
    )
    .where(eq(anchor_profile.anchor_id, anchor_id));
  if (!check || check.is_three) return;
  if (!check.live || Number(check.live) === 0) return;

  const cookies = await getActiveCookies(basecamp);
  const page = await openDouyinPage(cookies);
  try {
    for (const scene of SCENES) {
      for (const bizMode of BIZ_MODES) {
        const series = await fetchGamePromoForAnchor(page, anchor_id, date, scene, bizMode);
        const rows = parseGamePromoResponse(series, anchor_id, date, scene, bizMode);
        for (const row of rows) {
          // numeric 列 Drizzle 期望 string，将 number | null 序列化
          const dbRow = {
            ...row,
            promote_live_duration_1d:
              row.promote_live_duration_1d != null ? String(row.promote_live_duration_1d) : null,
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
              set: { ...dbRow, synced_at: new Date() },
            });
        }
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  } catch (e) {
    if (e instanceof CookieExpiredError) {
      await markCookieExpired(basecamp);
      await notifyCrawlerError({ type: "cookie_expired", detail: e.message });
    } else {
      await notifyCrawlerError({
        type: "job_failed",
        detail: `fetch-game(${anchor_id}) failed: ${(e as Error).message}`,
      });
    }
    throw e;
  } finally {
    await page.close();
  }
}
