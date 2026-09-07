import { db } from "@/db/client";
import { zhaohua_official_replay } from "@/db/schema";
import { CookieExpiredError, openLingjiPage } from "@/lib/puppeteer";
import {
  fetchLingjiHistory,
  fetchLingjiReplay,
  getActiveCookies,
  markCookieExpired,
  notifyCrawlerError,
} from "@/modules/crawler/server";

interface SyncOptions {
  fromDate?: string;
  toDate?: string;
}

interface SyncResult {
  fromDate: string;
  toDate: string;
  total: number;
  upserted: number;
  skipped: number;
}

function cstDate(deltaDays = 0): string {
  const now = new Date(Date.now() + deltaDays * 86_400_000);
  return now.toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
}

export async function syncZhaohuaOfficialReplaysHandler(
  options: SyncOptions = {},
): Promise<SyncResult> {
  const fromDate = options.fromDate ?? cstDate(-1);
  const toDate = options.toDate ?? fromDate;
  const cookies = await getActiveCookies("lingji");
  const page = await openLingjiPage(cookies);
  try {
    const history = await fetchLingjiHistory(page, fromDate, toDate);
    let upserted = 0;
    let skipped = 0;
    for (const item of history) {
      const replay = await fetchLingjiReplay(page, item);
      if (!replay) {
        skipped++;
        continue;
      }
      const metric = replay.metrics;
      await db
        .insert(zhaohua_official_replay)
        .values({
          room_id: replay.roomId,
          title: replay.title,
          started_at: replay.startedAt,
          ended_at: replay.endedAt,
          duration_seconds: replay.durationSeconds,
          exposure_uv: metric.exposureUv,
          enter_room_uv: metric.enterRoomUv,
          enter_room_rate: metric.enterRoomRate,
          avg_online: metric.avgOnline,
          peak_online: metric.peakOnline,
          avg_watch_seconds: metric.avgWatchSeconds,
          sound_wave: metric.soundWave,
          gift_users: metric.giftUsers,
          new_followers: metric.newFollowers,
          comment_users: metric.commentUsers,
          like_count: metric.likeCount,
          share_count: metric.shareCount,
          fan_club_users: metric.fanClubUsers,
          game_revenue: metric.gameRevenue,
          game_activations: metric.gameActivations,
          game_purchases: metric.gamePurchases,
          base_raw: replay.baseRaw,
          overview_raw: replay.overviewRaw,
          game_raw: replay.gameRaw,
          history_raw: replay.historyRaw,
        })
        .onConflictDoUpdate({
          target: zhaohua_official_replay.room_id,
          set: {
            title: replay.title,
            started_at: replay.startedAt,
            ended_at: replay.endedAt,
            duration_seconds: replay.durationSeconds,
            exposure_uv: metric.exposureUv,
            enter_room_uv: metric.enterRoomUv,
            enter_room_rate: metric.enterRoomRate,
            avg_online: metric.avgOnline,
            peak_online: metric.peakOnline,
            avg_watch_seconds: metric.avgWatchSeconds,
            sound_wave: metric.soundWave,
            gift_users: metric.giftUsers,
            new_followers: metric.newFollowers,
            comment_users: metric.commentUsers,
            like_count: metric.likeCount,
            share_count: metric.shareCount,
            fan_club_users: metric.fanClubUsers,
            game_revenue: metric.gameRevenue,
            game_activations: metric.gameActivations,
            game_purchases: metric.gamePurchases,
            base_raw: replay.baseRaw,
            overview_raw: replay.overviewRaw,
            game_raw: replay.gameRaw,
            history_raw: replay.historyRaw,
            synced_at: new Date(),
            updated_at: new Date(),
          },
        });
      upserted++;
    }
    return { fromDate, toDate, total: history.length, upserted, skipped };
  } catch (error) {
    if (
      error instanceof CookieExpiredError ||
      /login|cookie|auth/i.test((error as Error).message)
    ) {
      await markCookieExpired("lingji");
      await notifyCrawlerError({
        type: "cookie_expired",
        detail: `[zhaohua-official-replay] ${(error as Error).message}`,
        action: "在采集监控更新抖音灵机 Cookie",
      });
    } else {
      await notifyCrawlerError({
        type: "job_failed",
        detail: `sync-zhaohua-official-replays failed: ${(error as Error).message}`,
      });
    }
    throw error;
  } finally {
    await page.close();
  }
}
