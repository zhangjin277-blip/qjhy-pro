import { db } from "@/db/client";
import { douyin_live_room } from "@/db/schema";
import { sql } from "drizzle-orm";
import { openDouyinPage, CookieExpiredError } from "@/lib/puppeteer";
import {
  fetchDouyinLiveRooms,
  getActiveCookies,
  markCookieExpired,
  notifyCrawlerError,
} from "@/modules/crawler/server";

interface SyncResult {
  total: number;
  upserted: number;
}

/**
 * 抖音公会「正在直播」快照 → douyin_live_room（每 5 分钟）。
 * 平面图「抖音在播」口径 = last_seen_at 在最近 15 分钟内（容 2 次空窗）。
 * upsert 语义：room_id 首见插入（带 start_at），复见只刷流水/人气/last_seen_at。
 */
export async function syncDouyinLiveRoomsHandler(): Promise<SyncResult> {
  const cookies = await getActiveCookies("cs");
  const page = await openDouyinPage(cookies);

  try {
    const rooms = await fetchDouyinLiveRooms(page);
    console.log(`[douyin-live-rooms] fetched ${rooms.length} living rooms`);

    let upserted = 0;
    for (const r of rooms) {
      await db
        .insert(douyin_live_room)
        .values({
          room_id: r.room_id,
          platform_uid: r.platform_uid,
          nick_name: r.nick_name,
          title: r.title,
          start_at: r.start_at,
          ticket_count: r.ticket_count,
          user_count: r.user_count,
          raw: r.raw,
        })
        .onConflictDoUpdate({
          target: douyin_live_room.room_id,
          set: {
            nick_name: r.nick_name,
            title: r.title,
            ticket_count: r.ticket_count,
            user_count: r.user_count,
            last_seen_at: sql`now()`,
            raw: r.raw,
          },
        });
      upserted++;
    }

    const summary: SyncResult = { total: rooms.length, upserted };
    console.log("[sync-douyin-live-rooms] done", summary);
    return summary;
  } catch (e) {
    if (e instanceof CookieExpiredError) {
      await markCookieExpired("cs");
      await notifyCrawlerError({
        type: "cookie_expired",
        detail: `[douyin-live-rooms] ${e.message}`,
        action: "Admin 重新登录抖音公会后台续期",
      });
    } else {
      await notifyCrawlerError({
        type: "job_failed",
        detail: `sync-douyin-live-rooms failed: ${(e as Error).message}`,
      });
    }
    throw e;
  } finally {
    await page.close();
  }
}
