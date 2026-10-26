import { db } from "@/db/client";
import { bilibili_ai_comic_video_snapshot } from "@/db/schema";
import { sql } from "drizzle-orm";
import { CookieExpiredError, openBilibiliCreatorPage } from "@/lib/puppeteer";
import { fetchBilibiliAiComicVideos } from "@/modules/crawler/adapters/bilibili-ai-comic";
import { getActiveCookies, markCookieExpired, notifyCrawlerError } from "@/modules/crawler/server";

export async function syncBilibiliAiComicHandler() {
  const snapshotDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(
    new Date(),
  );
  let page;
  try {
    const cookies = await getActiveCookies("bilibili_creator");
    page = await openBilibiliCreatorPage(cookies);
    const works = await fetchBilibiliAiComicVideos(page);
    if (works.length) {
      await db
        .insert(bilibili_ai_comic_video_snapshot)
        .values(
          works.map((row) => ({
            item_id: row.item_id,
            snapshot_date: snapshotDate,
            publish_time: row.publish_time,
            description: row.description,
            cover_url: row.cover_url,
            duration_ms: row.duration_ms,
            view_count: row.view_count,
            like_count: row.like_count,
            comment_count: row.comment_count,
            share_count: row.share_count,
            favorite_count: row.favorite_count,
            danmaku_count: row.danmaku_count,
            coin_count: row.coin_count,
            subscribe_count: row.subscribe_count,
            unsubscribe_count: row.unsubscribe_count,
            raw: row.raw,
          })),
        )
        .onConflictDoUpdate({
          target: [
            bilibili_ai_comic_video_snapshot.item_id,
            bilibili_ai_comic_video_snapshot.snapshot_date,
          ],
          set: {
            publish_time: sql`excluded.publish_time`,
            description: sql`excluded.description`,
            cover_url: sql`excluded.cover_url`,
            duration_ms: sql`excluded.duration_ms`,
            view_count: sql`excluded.view_count`,
            like_count: sql`excluded.like_count`,
            comment_count: sql`excluded.comment_count`,
            share_count: sql`excluded.share_count`,
            favorite_count: sql`excluded.favorite_count`,
            danmaku_count: sql`excluded.danmaku_count`,
            coin_count: sql`excluded.coin_count`,
            subscribe_count: sql`excluded.subscribe_count`,
            unsubscribe_count: sql`excluded.unsubscribe_count`,
            raw: sql`excluded.raw`,
            collected_at: sql`now()`,
          },
        });
    }
    return { account: "B站", works: works.length, snapshotDate };
  } catch (error) {
    if (error instanceof CookieExpiredError) {
      await markCookieExpired("bilibili_creator");
      await notifyCrawlerError({
        type: "cookie_expired",
        detail: `bilibili AI comic: ${error.message}`,
      });
    } else {
      await notifyCrawlerError({
        type: "job_failed",
        detail: `bilibili AI comic: ${(error as Error).message}`,
      });
    }
    throw error;
  } finally {
    await page?.close();
  }
}
