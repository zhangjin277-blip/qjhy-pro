import { db } from "@/db/client";
import { kuaishou_ai_comic_video_snapshot } from "@/db/schema";
import { sql } from "drizzle-orm";
import { CookieExpiredError, openKuaishouCreatorPage } from "@/lib/puppeteer";
import { fetchKuaishouAiComicVideos } from "@/modules/crawler/adapters/kuaishou-ai-comic";
import { getActiveCookies, markCookieExpired, notifyCrawlerError } from "@/modules/crawler/server";

export async function syncKuaishouAiComicHandler() {
  const snapshotDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(
    new Date(),
  );
  let page;
  try {
    const cookies = await getActiveCookies("kuaishou_creator");
    page = await openKuaishouCreatorPage(cookies);
    const works = await fetchKuaishouAiComicVideos(page);
    if (works.length) {
      await db
        .insert(kuaishou_ai_comic_video_snapshot)
        .values(
          works.map((row) => ({
            item_id: row.item_id,
            snapshot_date: snapshotDate,
            publish_time: row.publish_time,
            description: row.description,
            cover_url: row.cover_url,
            view_count: row.view_count,
            like_count: row.like_count,
            comment_count: row.comment_count,
            share_count: row.share_count,
            favorite_count: row.favorite_count,
            subscribe_count: row.subscribe_count,
            raw: row.raw,
          })),
        )
        .onConflictDoUpdate({
          target: [
            kuaishou_ai_comic_video_snapshot.item_id,
            kuaishou_ai_comic_video_snapshot.snapshot_date,
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
            subscribe_count: sql`excluded.subscribe_count`,
            raw: sql`excluded.raw`,
            collected_at: sql`now()`,
          },
        });
    }
    return { account: "快手", works: works.length, snapshotDate };
  } catch (error) {
    if (error instanceof CookieExpiredError) {
      await markCookieExpired("kuaishou_creator");
      await notifyCrawlerError({
        type: "cookie_expired",
        detail: `kuaishou AI comic: ${error.message}`,
      });
    } else {
      await notifyCrawlerError({
        type: "job_failed",
        detail: `kuaishou AI comic: ${(error as Error).message}`,
      });
    }
    throw error;
  } finally {
    await page?.close();
  }
}
