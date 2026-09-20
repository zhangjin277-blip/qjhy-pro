import { db } from "@/db/client";
import {
  zhaohua_official_video_daily,
  zhaohua_official_video_hourly,
  zhaohua_official_video_snapshot,
} from "@/db/schema";
import { sql } from "drizzle-orm";
import { CookieExpiredError, openDouyinCreatorPage } from "@/lib/puppeteer";
import { getActiveCookies, markCookieExpired, notifyCrawlerError } from "@/modules/crawler/server";
import {
  fetchOfficialDailyMetrics,
  fetchOfficialVideoHourlyMetrics,
  fetchOfficialVideoWorks,
} from "@/modules/crawler/adapters/zhaohua-official-video";

const ACCOUNT_NAME = "造化仙府丨孙小圣";
const WORK_WINDOW_DAYS = 90;

export interface SyncZhaohuaOfficialVideosResult {
  account: string;
  works: number;
  daily: number;
  hourly: number;
  snapshotDate: string;
}

/** 每天更新官号作品明细和数据中心按日汇总，重复执行幂等。 */
export async function syncZhaohuaOfficialVideosHandler(): Promise<SyncZhaohuaOfficialVideosResult> {
  const now = new Date();
  const snapshotDate = now.toISOString().slice(0, 10);
  const beginDate = new Date(now.getTime() - (WORK_WINDOW_DAYS - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  let cookieBasecamp: "douyin_creator" | "lingji" = "douyin_creator";
  let cookies: Record<string, string>;
  try {
    cookies = await getActiveCookies("douyin_creator");
  } catch {
    cookieBasecamp = "lingji";
    cookies = await getActiveCookies("lingji");
  }
  const page = await openDouyinCreatorPage(cookies);
  try {
    const [works, daily] = await Promise.all([
      fetchOfficialVideoWorks(page, { beginDate }),
      fetchOfficialDailyMetrics(page, 30),
    ]);
    const hourly = works.length > 0 ? await fetchOfficialVideoHourlyMetrics(page, works) : [];
    if (works.length > 0) {
      await db
        .insert(zhaohua_official_video_snapshot)
        .values(
          works.map((row) => ({
            item_id: row.item_id,
            snapshot_date: snapshotDate,
            publish_time: row.publish_time,
            description: row.description,
            cover_url: row.cover_url,
            duration_ms: row.duration_ms,
            visibility: row.visibility,
            view_count: integerMetric(row.metrics.view_count),
            like_count: integerMetric(row.metrics.like_count),
            comment_count: integerMetric(row.metrics.comment_count),
            share_count: integerMetric(row.metrics.share_count),
            favorite_count: integerMetric(row.metrics.favorite_count),
            danmaku_count: integerMetric(row.metrics.danmaku_count),
            subscribe_count: integerMetric(row.metrics.subscribe_count),
            unsubscribe_count: integerMetric(row.metrics.unsubscribe_count),
            avg_view_second: decimalMetric(row.metrics.avg_view_second),
            avg_view_proportion: decimalMetric(row.metrics.avg_view_proportion),
            completion_rate: decimalMetric(row.metrics.completion_rate),
            completion_rate_5s: decimalMetric(row.metrics.completion_rate_5s),
            bounce_rate_2s: decimalMetric(row.metrics.bounce_rate_2s),
            cover_click_rate: decimalMetric(row.metrics.cover_click_rate),
            raw: row.raw,
          })),
        )
        .onConflictDoUpdate({
          target: [
            zhaohua_official_video_snapshot.item_id,
            zhaohua_official_video_snapshot.snapshot_date,
          ],
          set: {
            publish_time: sql`excluded.publish_time`,
            description: sql`excluded.description`,
            cover_url: sql`excluded.cover_url`,
            duration_ms: sql`excluded.duration_ms`,
            visibility: sql`excluded.visibility`,
            view_count: sql`excluded.view_count`,
            like_count: sql`excluded.like_count`,
            comment_count: sql`excluded.comment_count`,
            share_count: sql`excluded.share_count`,
            favorite_count: sql`excluded.favorite_count`,
            danmaku_count: sql`excluded.danmaku_count`,
            subscribe_count: sql`excluded.subscribe_count`,
            unsubscribe_count: sql`excluded.unsubscribe_count`,
            avg_view_second: sql`excluded.avg_view_second`,
            avg_view_proportion: sql`excluded.avg_view_proportion`,
            completion_rate: sql`excluded.completion_rate`,
            completion_rate_5s: sql`excluded.completion_rate_5s`,
            bounce_rate_2s: sql`excluded.bounce_rate_2s`,
            cover_click_rate: sql`excluded.cover_click_rate`,
            raw: sql`excluded.raw`,
          },
        });
    }
    if (daily.length > 0) {
      await db
        .insert(zhaohua_official_video_daily)
        .values(
          daily.map((row) => ({
            metric_date: row.metric_date,
            publish_count: integerMetric(row.values.publish_cnt),
            play_count: integerMetric(row.values.play_cnt),
            like_count: integerMetric(row.values.digg_cnt),
            share_count: integerMetric(row.values.share_count),
            comment_count: integerMetric(row.values.comment_cnt),
            net_fans_count: integerMetric(row.values.net_fans_cnt),
            cancel_fans_count: integerMetric(row.values.cancel_fans_cnt),
            homepage_view_count: integerMetric(row.values.homepage_view_cnt),
            completion_rate_5s: decimalMetric(row.values.completion_rate_5s),
            bounce_rate_2s: decimalMetric(row.values.bounce_rate_2s),
            cover_click_rate: decimalMetric(row.values.cover_click_ratio),
            raw: row.raw,
          })),
        )
        .onConflictDoUpdate({
          target: zhaohua_official_video_daily.metric_date,
          set: {
            publish_count: sql`excluded.publish_count`,
            play_count: sql`excluded.play_count`,
            like_count: sql`excluded.like_count`,
            share_count: sql`excluded.share_count`,
            comment_count: sql`excluded.comment_count`,
            net_fans_count: sql`excluded.net_fans_count`,
            cancel_fans_count: sql`excluded.cancel_fans_count`,
            homepage_view_count: sql`excluded.homepage_view_count`,
            completion_rate_5s: sql`excluded.completion_rate_5s`,
            bounce_rate_2s: sql`excluded.bounce_rate_2s`,
            cover_click_rate: sql`excluded.cover_click_rate`,
            raw: sql`excluded.raw`,
            collected_at: sql`now()`,
          },
        });
    }
    if (hourly.length > 0) {
      for (let offset = 0; offset < hourly.length; offset += 500) {
        const batch = hourly.slice(offset, offset + 500);
        await db
          .insert(zhaohua_official_video_hourly)
          .values(
            batch.map((point) => ({
              item_id: point.item_id,
              metric_type: point.metric_type,
              point_at: point.point_at,
              value: String(point.value),
              raw: point.raw,
            })),
          )
          .onConflictDoUpdate({
            target: [
              zhaohua_official_video_hourly.item_id,
              zhaohua_official_video_hourly.metric_type,
              zhaohua_official_video_hourly.point_at,
            ],
            set: { value: sql`excluded.value`, raw: sql`excluded.raw`, collected_at: sql`now()` },
          });
      }
    }
    console.log(
      `[zhaohua-official-videos] account=${ACCOUNT_NAME} works=${works.length} daily=${daily.length} hourly=${hourly.length}`,
    );
    return {
      account: ACCOUNT_NAME,
      works: works.length,
      daily: daily.length,
      hourly: hourly.length,
      snapshotDate,
    };
  } catch (error) {
    if (error instanceof CookieExpiredError) {
      await markCookieExpired(cookieBasecamp);
      await notifyCrawlerError({
        type: "cookie_expired",
        detail: `zhaohua official creator: ${error.message}`,
      });
    } else
      await notifyCrawlerError({
        type: "job_failed",
        detail: `zhaohua official videos: ${(error as Error).message}`,
      });
    throw error;
  } finally {
    await page.close();
  }
}
function integerMetric(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}
function decimalMetric(value: unknown): string | null {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : null;
}
