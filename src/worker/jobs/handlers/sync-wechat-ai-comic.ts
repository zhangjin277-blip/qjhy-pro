import { db } from "@/db/client";
import { wechat_ai_comic_daily, wechat_ai_comic_video_snapshot } from "@/db/schema";
import { sql } from "drizzle-orm";
import { CookieExpiredError, openWechatCreatorPage } from "@/lib/puppeteer";
import { fetchWechatAiComic } from "@/modules/crawler/adapters/wechat-ai-comic";
import { getActiveCookies, markCookieExpired, notifyCrawlerError } from "@/modules/crawler/server";

export async function syncWechatAiComicHandler() {
  const snapshotDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(
    new Date(),
  );
  let page;
  try {
    const cookies = await getActiveCookies("wechat_creator");
    page = await openWechatCreatorPage(cookies);
    const { works, daily } = await fetchWechatAiComic(page);
    if (works.length)
      await db
        .insert(wechat_ai_comic_video_snapshot)
        .values(
          works.map((row) => ({
            item_id: row.item_id,
            snapshot_date: snapshotDate,
            publish_time: row.publish_time,
            description: row.description,
            cover_url: row.cover_url,
            view_count: row.metrics.play,
            like_count: row.metrics.like,
            comment_count: row.metrics.comment,
            share_count: row.metrics.share,
            subscribe_count: row.metrics.fans,
            raw: row.raw,
          })),
        )
        .onConflictDoUpdate({
          target: [
            wechat_ai_comic_video_snapshot.item_id,
            wechat_ai_comic_video_snapshot.snapshot_date,
          ],
          set: {
            publish_time: sql`excluded.publish_time`,
            description: sql`excluded.description`,
            cover_url: sql`excluded.cover_url`,
            view_count: sql`excluded.view_count`,
            like_count: sql`excluded.like_count`,
            comment_count: sql`excluded.comment_count`,
            share_count: sql`excluded.share_count`,
            subscribe_count: sql`excluded.subscribe_count`,
            raw: sql`excluded.raw`,
            collected_at: sql`now()`,
          },
        });
    if (daily.length)
      await db
        .insert(wechat_ai_comic_daily)
        .values(
          daily.map((row) => ({
            metric_date: row.metric_date,
            play_count: row.values.play,
            like_count: row.values.like,
            comment_count: row.values.comment,
            share_count: row.values.share,
            net_fans_count: row.values.fans,
            raw: row.raw,
          })),
        )
        .onConflictDoUpdate({
          target: wechat_ai_comic_daily.metric_date,
          set: {
            play_count: sql`excluded.play_count`,
            like_count: sql`excluded.like_count`,
            comment_count: sql`excluded.comment_count`,
            share_count: sql`excluded.share_count`,
            net_fans_count: sql`excluded.net_fans_count`,
            raw: sql`excluded.raw`,
            collected_at: sql`now()`,
          },
        });
    return { account: "视频号", works: works.length, daily: daily.length, snapshotDate };
  } catch (error) {
    if (error instanceof CookieExpiredError) {
      await markCookieExpired("wechat_creator");
      await notifyCrawlerError({
        type: "cookie_expired",
        detail: `wechat AI comic: ${error.message}`,
      });
    } else
      await notifyCrawlerError({
        type: "job_failed",
        detail: `wechat AI comic: ${(error as Error).message}`,
      });
    throw error;
  } finally {
    await page?.close();
  }
}
