import { db } from "@/db/client";
import { douyin_video_snapshot } from "@/db/schema";
import { sql } from "drizzle-orm";
import { openDouyinPage, CookieExpiredError } from "@/lib/puppeteer";
import {
  fetchVideoListForAnchor,
  getActiveCookies,
  markCookieExpired,
  notifyCrawlerError,
  resolveOfflineOpAnchors,
} from "@/modules/crawler/server";
import type { Basecamp } from "@/modules/crawler/server";

const WINDOW_DAYS = 30;

export interface FetchVideoPayload {
  basecamp: Basecamp; // 当前只支持 cs（长沙百应账号）
}

export interface FetchVideoResult {
  anchors: number;
  rows: number;
  fail: number;
  window: { begin: string; end: string };
}

/**
 * 每天 12:00 cron 拉「线下运营」组带的主播在百应的视频作品列表（近 30 天滑动窗口），
 * 写 douyin_video_snapshot 当日快照。
 *
 * "有效视频数"查询时取每个 item_id 最新快照 → is_secret=0 计数。
 */
export async function fetchVideoHandler(payload: FetchVideoPayload): Promise<FetchVideoResult> {
  const { basecamp } = payload;

  const today = new Date();
  const todayStr = toDateStr(today);
  const beginStr = toDateStr(new Date(today.getTime() - (WINDOW_DAYS - 1) * 86400_000));

  const anchors = await resolveOfflineOpAnchors();
  if (anchors.length === 0) {
    console.log(`[fetch-video] no offline-op anchors found`);
    return { anchors: 0, rows: 0, fail: 0, window: { begin: beginStr, end: todayStr } };
  }
  console.log(`[fetch-video] ${anchors.length} anchors, window ${beginStr}~${todayStr}`);

  const cookies = await getActiveCookies(basecamp);
  const page = await openDouyinPage(cookies);
  let totalRows = 0;
  let fail = 0;

  try {
    for (const a of anchors) {
      try {
        const rows = await fetchVideoListForAnchor(page, a.anchor_id, beginStr, todayStr);
        if (rows.length === 0) {
          // 无视频不计失败（可能本来就没发过）
          continue;
        }
        const dbRows = rows.map((r) => ({
          item_id: r.item_id,
          snapshot_date: todayStr,
          anchor_id: r.anchor_id,
          publish_time: r.publish_time,
          is_secret: r.is_secret,
          title: r.title,
          cover_url: r.cover_url,
          play_count: r.play_count,
          recommend_play_count: r.recommend_play_count,
          like_count: r.like_count,
          comment_count: r.comment_count,
          share_count: r.share_count,
          new_follow_count: r.new_follow_count,
          norm: r.norm,
          raw: r.raw,
        }));
        // 同一天重复跑就覆盖（幂等）。set 用 excluded.* 引用每行的新值（不是某条固定值）。
        await db
          .insert(douyin_video_snapshot)
          .values(dbRows)
          .onConflictDoUpdate({
            target: [douyin_video_snapshot.item_id, douyin_video_snapshot.snapshot_date],
            set: {
              anchor_id: sql`excluded.anchor_id`,
              publish_time: sql`excluded.publish_time`,
              is_secret: sql`excluded.is_secret`,
              title: sql`excluded.title`,
              cover_url: sql`excluded.cover_url`,
              play_count: sql`excluded.play_count`,
              recommend_play_count: sql`excluded.recommend_play_count`,
              like_count: sql`excluded.like_count`,
              comment_count: sql`excluded.comment_count`,
              share_count: sql`excluded.share_count`,
              new_follow_count: sql`excluded.new_follow_count`,
              norm: sql`excluded.norm`,
              raw: sql`excluded.raw`,
            },
          });
        totalRows += rows.length;
        await new Promise((r) => setTimeout(r, 200));
      } catch (e) {
        if (e instanceof CookieExpiredError) throw e;
        fail++;
        if (fail < 5) {
          console.warn(
            `[fetch-video] ${a.anchor_id} (${a.nick_name}) failed: ${(e as Error).message}`,
          );
        }
      }
    }
    console.log(`[fetch-video] done: ${anchors.length} anchors, ${totalRows} rows, ${fail} fail`);
    return {
      anchors: anchors.length,
      rows: totalRows,
      fail,
      window: { begin: beginStr, end: todayStr },
    };
  } catch (e) {
    if (e instanceof CookieExpiredError) {
      await markCookieExpired(basecamp);
      await notifyCrawlerError({ type: "cookie_expired", detail: e.message });
    } else {
      await notifyCrawlerError({
        type: "job_failed",
        detail: `fetch-video batch failed: ${(e as Error).message}`,
      });
    }
    throw e;
  } finally {
    await page.close();
  }
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
