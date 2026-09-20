import { getBoss, JOB_NAMES } from "@/modules/crawler/server";
import { checkDataReadyHandler } from "./check-data-ready";
import { fetchProfileHandler } from "./fetch-profile";
import { fetchDailyHandler } from "./fetch-daily";
import { fetchGameHandler } from "./fetch-game";
import { fetchMinigameHandler } from "./fetch-minigame";
import { fetchPortraitHandler } from "./fetch-portrait";
import { fetchSessionMgHandler } from "./fetch-session-mg";
import { syncKuaishouMembersHandler } from "./sync-kuaishou-members";
import { syncKuaishouHistoryLiveSessionsHandler } from "./sync-kuaishou-history-live";
import { syncKuaishouTodayLiveSessionsHandler } from "./sync-kuaishou-today-live";
import { syncKuaishouLiveSnapshotHandler } from "./sync-kuaishou-live-snapshot";
import { backfillKuaishouTrendHandler } from "./backfill-kuaishou-trend";
import { fetchVideoHandler } from "./fetch-video";
import { syncDouyinLiveRoomsHandler } from "./sync-douyin-live-rooms";
import { syncZhaohuaOfficialReplaysHandler } from "./sync-zhaohua-official-replays";
import { syncZhaohuaOfficialVideosHandler } from "./sync-zhaohua-official-videos";
import type PgBoss from "pg-boss";

// batchSize=1: one job at a time, avoids rate-limit / Cookie contention.
// pg-boss WorkHandler always passes at least 1 job when batchSize=1.
// Handler return value 会作为 pgboss.job.output 写回，供 admin/crawler 队列页展示。
//
// 抛错必须 sanitize：drizzle 抛 SQL 错时会把 query parameters（可能含 BigInt）
// 挂到 error 上。pg-boss Manager.fail() 写 output(jsonb) 时 JSON.stringify
// 遇到 BigInt 字段会抛 Uncaught Exception → worker 进程整个 crash → docker
// 自动重启 → 同一 job 再跑再炸，死循环。
function sanitizeError(e: unknown): Error {
  if (e instanceof Error) {
    let msg = e.message;
    // drizzle 把底层 PostgresError 挂在 .cause 上（带具体 detail，如 "value too long"），
    // 但 cause 上也可能挂 BigInt parameters。只摘 message 字段并入主消息。
    const cause = (e as { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message && cause.message !== e.message) {
      msg += `\n  → ${cause.message}`;
    }
    const clean = new Error(msg);
    clean.name = e.name;
    return clean;
  }
  return new Error(String(e));
}

function runFirst<T, R>(
  fn: (data: T) => Promise<R>,
): (jobs: PgBoss.Job<T>[]) => Promise<R | undefined> {
  return async (jobs) => {
    const job = jobs.at(0);
    if (job === undefined) return undefined;
    try {
      return await fn(job.data);
    } catch (e) {
      throw sanitizeError(e);
    }
  };
}

function wrap<R>(fn: () => Promise<R>): Promise<R> {
  return fn().catch((e) => {
    throw sanitizeError(e);
  });
}

export async function registerCrawlerHandlers(): Promise<void> {
  const boss = await getBoss();
  // pg-boss v10 要求显式 createQueue
  for (const name of Object.values(JOB_NAMES)) {
    await boss.createQueue(name);
  }
  await boss.work(JOB_NAMES.CHECK_DATA_READY, { batchSize: 1 }, runFirst(checkDataReadyHandler));
  await boss.work(JOB_NAMES.FETCH_PROFILE, { batchSize: 1 }, runFirst(fetchProfileHandler));
  await boss.work(JOB_NAMES.FETCH_DAILY, { batchSize: 1 }, runFirst(fetchDailyHandler));
  await boss.work(JOB_NAMES.FETCH_GAME, { batchSize: 1 }, runFirst(fetchGameHandler));
  await boss.work(JOB_NAMES.FETCH_MINIGAME, { batchSize: 1 }, runFirst(fetchMinigameHandler));
  await boss.work(JOB_NAMES.FETCH_PORTRAIT, { batchSize: 1 }, runFirst(fetchPortraitHandler));
  await boss.work(JOB_NAMES.FETCH_SESSION_MG, { batchSize: 1 }, runFirst(fetchSessionMgHandler));
  // 快手成员同步无 payload，封装成忽略 jobs 数据的 handler
  await boss.work(JOB_NAMES.SYNC_KUAISHOU_MEMBERS, { batchSize: 1 }, async (jobs) => {
    const job = jobs.at(0);
    if (job === undefined) return undefined;
    return await wrap(() => syncKuaishouMembersHandler());
  });
  await boss.work(JOB_NAMES.SYNC_KUAISHOU_HISTORY_LIVE, { batchSize: 1 }, async (jobs) => {
    const job = jobs.at(0);
    if (job === undefined) return undefined;
    const data = (job.data ?? {}) as { fromDate?: string; toDate?: string };
    return await wrap(() =>
      syncKuaishouHistoryLiveSessionsHandler({
        fromDate: data.fromDate,
        toDate: data.toDate,
      }),
    );
  });
  await boss.work(JOB_NAMES.SYNC_KUAISHOU_TODAY_LIVE, { batchSize: 1 }, async (jobs) => {
    const job = jobs.at(0);
    if (job === undefined) return undefined;
    return await wrap(() => syncKuaishouTodayLiveSessionsHandler());
  });
  await boss.work(JOB_NAMES.SYNC_KUAISHOU_LIVE_SNAPSHOT, { batchSize: 1 }, async (jobs) => {
    const job = jobs.at(0);
    if (job === undefined) return undefined;
    return await wrap(() => syncKuaishouLiveSnapshotHandler());
  });
  await boss.work(JOB_NAMES.BACKFILL_KUAISHOU_TREND, { batchSize: 1 }, async (jobs) => {
    const job = jobs.at(0);
    if (job === undefined) return undefined;
    const data = (job.data ?? {}) as { fromDate?: string; toDate?: string };
    return await wrap(() =>
      backfillKuaishouTrendHandler({ fromDate: data.fromDate, toDate: data.toDate }),
    );
  });
  await boss.work(JOB_NAMES.FETCH_VIDEO, { batchSize: 1 }, runFirst(fetchVideoHandler));
  await boss.work(JOB_NAMES.SYNC_DOUYIN_LIVE_ROOMS, { batchSize: 1 }, async (jobs) => {
    const job = jobs.at(0);
    if (job === undefined) return undefined;
    return await wrap(() => syncDouyinLiveRoomsHandler());
  });
  await boss.work(JOB_NAMES.SYNC_ZHAOHUA_OFFICIAL_REPLAYS, { batchSize: 1 }, async (jobs) => {
    const job = jobs.at(0);
    if (job === undefined) return undefined;
    const data = (job.data ?? {}) as { fromDate?: string; toDate?: string };
    return await wrap(() => syncZhaohuaOfficialReplaysHandler(data));
  });
  await boss.work(JOB_NAMES.SYNC_ZHAOHUA_OFFICIAL_VIDEOS, { batchSize: 1 }, async (jobs) => {
    if (jobs.at(0) === undefined) return undefined;
    return await wrap(() => syncZhaohuaOfficialVideosHandler());
  });
  console.log("[crawler] all 15 handlers registered");
}
