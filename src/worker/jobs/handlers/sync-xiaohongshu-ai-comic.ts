import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { xiaohongshu_ai_comic_video_snapshot } from "@/db/schema";
import { CookieExpiredError, openXiaohongshuCreatorPage } from "@/lib/puppeteer";
import { fetchXiaohongshuAiComicVideos } from "@/modules/crawler/adapters/xiaohongshu-ai-comic";
import { getActiveCookies, markCookieExpired, notifyCrawlerError } from "@/modules/crawler/server";

export async function syncXiaohongshuAiComicHandler() {
  const snapshotDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(
    new Date(),
  );
  let page;
  try {
    const cookies = await getActiveCookies("xiaohongshu_creator");
    page = await openXiaohongshuCreatorPage(cookies);
    const works = (await fetchXiaohongshuAiComicVideos(page)).filter((row) =>
      /\bep\s*\.?\s*\d+/i.test(row.description ?? ""),
    );
    if (works.length) {
      await db
        .insert(xiaohongshu_ai_comic_video_snapshot)
        .values(
          works.map((row) => ({
            ...row,
            snapshot_date: snapshotDate,
            avg_view_second: numericString(row.avg_view_second),
            completion_rate: numericString(row.completion_rate),
            completion_rate_5s: numericString(row.completion_rate_5s),
            bounce_rate_2s: numericString(row.bounce_rate_2s),
            cover_click_rate: numericString(row.cover_click_rate),
          })),
        )
        .onConflictDoUpdate({
          target: [
            xiaohongshu_ai_comic_video_snapshot.item_id,
            xiaohongshu_ai_comic_video_snapshot.snapshot_date,
          ],
          set: {
            publish_time: sql`excluded.publish_time`,
            description: sql`excluded.description`,
            cover_url: sql`excluded.cover_url`,
            view_count: sql`excluded.view_count`,
            like_count: sql`excluded.like_count`,
            comment_count: sql`excluded.comment_count`,
            share_count: sql`excluded.share_count`,
            favorite_count: sql`excluded.favorite_count`,
            danmaku_count: sql`excluded.danmaku_count`,
            subscribe_count: sql`excluded.subscribe_count`,
            avg_view_second: sql`excluded.avg_view_second`,
            completion_rate: sql`excluded.completion_rate`,
            completion_rate_5s: sql`excluded.completion_rate_5s`,
            bounce_rate_2s: sql`excluded.bounce_rate_2s`,
            cover_click_rate: sql`excluded.cover_click_rate`,
            raw: sql`excluded.raw`,
            collected_at: sql`now()`,
          },
        });
    }
    return { account: "小红书", works: works.length, snapshotDate };
  } catch (error) {
    if (error instanceof CookieExpiredError) {
      await markCookieExpired("xiaohongshu_creator");
      await notifyCrawlerError({
        type: "cookie_expired",
        detail: `xiaohongshu AI comic: ${error.message}`,
      });
    } else {
      await notifyCrawlerError({
        type: "job_failed",
        detail: `xiaohongshu AI comic: ${(error as Error).message}`,
      });
    }
    throw error;
  } finally {
    await page?.close();
  }
}

function numericString(value: number | null): string | null {
  return value === null ? null : String(value);
}
