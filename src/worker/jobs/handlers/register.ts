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
import type PgBoss from "pg-boss";

// batchSize=1: one job at a time, avoids rate-limit / Cookie contention.
// pg-boss WorkHandler always passes at least 1 job when batchSize=1.
function runFirst<T>(fn: (data: T) => Promise<void>): (jobs: PgBoss.Job<T>[]) => Promise<void> {
  return async (jobs) => {
    const job = jobs.at(0);
    if (job === undefined) return;
    await fn(job.data);
  };
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
    if (job === undefined) return;
    await syncKuaishouMembersHandler();
  });
  await boss.work(JOB_NAMES.SYNC_KUAISHOU_HISTORY_LIVE, { batchSize: 1 }, async (jobs) => {
    const job = jobs.at(0);
    if (job === undefined) return;
    const data = (job.data ?? {}) as { fromDate?: string; toDate?: string };
    await syncKuaishouHistoryLiveSessionsHandler({
      fromDate: data.fromDate,
      toDate: data.toDate,
    });
  });
  await boss.work(JOB_NAMES.SYNC_KUAISHOU_TODAY_LIVE, { batchSize: 1 }, async (jobs) => {
    const job = jobs.at(0);
    if (job === undefined) return;
    await syncKuaishouTodayLiveSessionsHandler();
  });
  console.log("[crawler] all 10 handlers registered");
}
