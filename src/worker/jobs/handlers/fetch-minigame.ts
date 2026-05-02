import { db } from "@/db/client";
import { anchor_minigame_daily, anchor_profile, anchor_daily } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { openDouyinPage, CookieExpiredError } from "@/lib/puppeteer";
import {
  getActiveCookies,
  markCookieExpired,
  notifyCrawlerError,
  fetchMinigameLiveForAnchor,
  parseMinigameLiveResponse,
  fetchMinigameVideoForAnchor,
  parseMinigameVideoResponse,
} from "@/modules/crawler/server";
import type { FetchPerAnchorPayload } from "@/modules/crawler/server";

export async function fetchMinigameHandler(payload: FetchPerAnchorPayload): Promise<void> {
  const { anchor_id, date, basecamp } = payload;

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
  if (!check || !check.is_three) return;
  if (!check.live || Number(check.live) === 0) return;

  const cookies = await getActiveCookies(basecamp);
  const page = await openDouyinPage(cookies);
  try {
    // live
    const liveSeries = await fetchMinigameLiveForAnchor(page, anchor_id, date);
    for (const row of parseMinigameLiveResponse(liveSeries, anchor_id, date)) {
      const dbRow = {
        ...row,
        live_duration: row.live_duration != null ? String(row.live_duration) : null,
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
          ],
          set: { ...dbRow, synced_at: new Date() },
        });
    }
    await new Promise((r) => setTimeout(r, 300));
    // video
    const videoSeries = await fetchMinigameVideoForAnchor(page, anchor_id, date);
    for (const row of parseMinigameVideoResponse(videoSeries, anchor_id, date)) {
      const dbRow = {
        ...row,
        live_duration: row.live_duration != null ? String(row.live_duration) : null,
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
          ],
          set: { ...dbRow, synced_at: new Date() },
        });
    }
  } catch (e) {
    if (e instanceof CookieExpiredError) {
      await markCookieExpired(basecamp);
      await notifyCrawlerError({ type: "cookie_expired", detail: e.message });
    } else {
      await notifyCrawlerError({
        type: "job_failed",
        detail: `fetch-minigame(${anchor_id}) failed: ${(e as Error).message}`,
      });
    }
    throw e;
  } finally {
    await page.close();
  }
}
