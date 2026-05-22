import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { kuaishou_live_trend } from "@/db/schema";
import { CookieExpiredError } from "@/lib/puppeteer";
import {
  getActiveCookies,
  markCookieExpired,
  notifyCrawlerError,
  fetchKuaishouLiveList,
  fetchKuaishouLiveTrend,
  type KuaishouTrendBundle,
} from "@/modules/crawler/server";

interface SnapshotResult {
  rooms: number;
  trendPointsUpserted: number;
  failed: number;
}

const REQUEST_DELAY_MS = 100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 一次"分时拉取"：
 *   1. jigou /live/list 拿当前在播 rooms（含字符串 streamLiveId）
 *   2. 对每个 room 调 666 /monitor/trend → 拿整场分时累计（1 min/点）
 *   3. UPSERT 进 kuaishou_live_trend，主键 (live_stream_id_str, ts)
 *
 * 接口给整场历史，所以本 job 不需要每分钟跑（5 min 即可）。
 * 单次同房间多次拉取自动去重 / 修复后期更新值。
 *
 * 字段单位：
 *   trend.value (SUM_VALID_INCOME) 是元（小数）→ ×100 转 cents 存 bigint
 *   其它（在线/弹幕/点赞/分享）整数
 */
export async function syncKuaishouLiveSnapshotHandler(): Promise<SnapshotResult> {
  const cookies = await getActiveCookies("kuaishou");

  try {
    const rooms = await fetchKuaishouLiveList(cookies);
    console.log(`[ks-trend-sync] live/list returned ${rooms.length} rooms`);
    if (rooms.length === 0) return { rooms: 0, trendPointsUpserted: 0, failed: 0 };

    let trendPointsUpserted = 0;
    let failed = 0;

    for (const r of rooms) {
      let bundle: KuaishouTrendBundle | null = null;
      try {
        bundle = await fetchKuaishouLiveTrend(cookies, r.streamLiveIdStr);
      } catch (e) {
        if (e instanceof CookieExpiredError) throw e;
        console.warn(`[ks-trend-sync] trend failed for ${r.streamLiveIdStr}:`, e);
        failed++;
        continue;
      }
      if (!bundle) {
        failed++;
        continue;
      }

      // 把 5 个序列按 timestamp 合并成行
      // SUM_VALID_INCOME 是主导，其它按 time 索引合并
      const byTime = new Map<
        number,
        {
          income_cents: number;
          online?: number;
          bullet?: number;
          like?: number;
          share?: number;
        }
      >();
      for (const p of bundle.validIncome) {
        byTime.set(p.time, { income_cents: Math.round(p.value * 100) });
      }
      const merge = (
        arr: { time: number; value: number }[],
        field: "online" | "bullet" | "like" | "share",
      ) => {
        for (const p of arr) {
          const row = byTime.get(p.time);
          if (row) row[field] = Math.round(p.value);
        }
      };
      merge(bundle.onlineCount, "online");
      merge(bundle.bulletCount, "bullet");
      merge(bundle.likeCount, "like");
      merge(bundle.shareCount, "share");

      if (byTime.size === 0) {
        // 接口给 result=1 但 trendData 空（极少数已下播太久的场次）
        failed++;
        continue;
      }

      const values = [...byTime.entries()].map(([time, m]) => ({
        live_stream_id_str: r.streamLiveIdStr,
        member_id: String(r.memberId),
        member_name: r.memberName,
        ts: new Date(time),
        valid_income_cents: m.income_cents,
        online_count: m.online ?? null,
        bullet_count: m.bullet ?? null,
        like_count: m.like ?? null,
        share_count: m.share ?? null,
      }));

      // 批量 upsert：冲突时取 GREATEST 防止后期偶然回落（trend 累计值理论上单调递增）
      await db
        .insert(kuaishou_live_trend)
        .values(values)
        .onConflictDoUpdate({
          target: [kuaishou_live_trend.live_stream_id_str, kuaishou_live_trend.ts],
          set: {
            valid_income_cents: sql`GREATEST(${kuaishou_live_trend.valid_income_cents}, EXCLUDED.valid_income_cents)`,
            online_count: sql`EXCLUDED.online_count`,
            bullet_count: sql`GREATEST(${kuaishou_live_trend.bullet_count}, EXCLUDED.bullet_count)`,
            like_count: sql`GREATEST(${kuaishou_live_trend.like_count}, EXCLUDED.like_count)`,
            share_count: sql`GREATEST(${kuaishou_live_trend.share_count}, EXCLUDED.share_count)`,
            fetched_at: sql`now()`,
          },
        });
      trendPointsUpserted += values.length;
      console.log(
        `[ks-trend-sync] ${r.memberName}/${r.streamLiveIdStr} upserted ${values.length} pts`,
      );

      await sleep(REQUEST_DELAY_MS);
    }

    console.log(
      `[ks-trend-sync] done: rooms=${rooms.length} upserted=${trendPointsUpserted} failed=${failed}`,
    );
    return { rooms: rooms.length, trendPointsUpserted, failed };
  } catch (e) {
    if (e instanceof CookieExpiredError) {
      await markCookieExpired("kuaishou");
      await notifyCrawlerError({
        type: "cookie_expired",
        detail: `[ks-trend-sync] ${e.message}`,
        action: "Admin 扫码续期快手机构后台",
      });
    } else {
      await notifyCrawlerError({
        type: "job_failed",
        detail: `sync-kuaishou-live-snapshot failed: ${(e as Error).message}`,
      });
    }
    throw e;
  }
}
