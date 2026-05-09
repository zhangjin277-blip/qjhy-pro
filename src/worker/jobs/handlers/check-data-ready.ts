import { openDouyinPage } from "@/lib/puppeteer";
import {
  getActiveCookies,
  enqueue,
  notifyCrawlerError,
  JOB_NAMES,
  checkDataReady,
  MAX_READINESS_ATTEMPTS,
  READINESS_RETRY_INTERVAL_MS,
} from "@/modules/crawler/server";
import type { CheckDataReadyPayload } from "@/modules/crawler/server";

export interface CheckDataReadyResult {
  ready: boolean;
  attempt: number;
  detail: string;
}

export async function checkDataReadyHandler(
  payload: CheckDataReadyPayload,
): Promise<CheckDataReadyResult> {
  const { date, basecamp, attempt } = payload;
  const cookies = await getActiveCookies(basecamp);
  const page = await openDouyinPage(cookies);
  try {
    const { ready, detail } = await checkDataReady(page, date);
    if (ready) {
      console.log(`[check-data-ready] ✓ ready (${detail}) attempt=${attempt}`);
      await enqueue(JOB_NAMES.FETCH_PROFILE, { date, basecamp });
      await enqueue(JOB_NAMES.FETCH_DAILY, { date, basecamp });
      return { ready: true, attempt, detail };
    }
    if (attempt >= MAX_READINESS_ATTEMPTS) {
      await notifyCrawlerError({
        type: "data_not_ready",
        detail: `数据就绪检测 ${attempt} 次后仍未刷新（${detail}），停止当日采集`,
        impact: `${date} 数据未采集`,
        action: "等待平台刷新或联系开发",
      });
      return { ready: false, attempt, detail };
    }
    await enqueue<CheckDataReadyPayload>(
      JOB_NAMES.CHECK_DATA_READY,
      { date, basecamp, attempt: attempt + 1 },
      { startAfter: new Date(Date.now() + READINESS_RETRY_INTERVAL_MS) },
    );
    console.log(`[check-data-ready] not ready (${detail}) attempt=${attempt}, retry in 30 min`);
    return { ready: false, attempt, detail };
  } finally {
    await page.close();
  }
}
