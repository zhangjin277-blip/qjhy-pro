import { openDouyinPage } from "@/lib/puppeteer";
import {
  getActiveCookies,
  enqueue,
  notifyCrawlerError,
  JOB_NAMES,
  fetchAnchorDaily,
  isDailyReady,
  MAX_READINESS_ATTEMPTS,
  READINESS_RETRY_INTERVAL_MS,
} from "@/modules/crawler/server";
import type { CheckDataReadyPayload } from "@/modules/crawler/server";

export async function checkDataReadyHandler(payload: CheckDataReadyPayload): Promise<void> {
  const { date, basecamp, attempt } = payload;
  const cookies = await getActiveCookies(basecamp);
  const page = await openDouyinPage(cookies);
  try {
    const { list } = await fetchAnchorDaily(page, date, 1, 50);
    if (isDailyReady(list)) {
      console.log(`[check-data-ready] data ready for ${date} (attempt=${attempt})`);
      // 触发下游
      await enqueue(JOB_NAMES.FETCH_PROFILE, { date, basecamp });
      await enqueue(JOB_NAMES.FETCH_DAILY, { date, basecamp });
      return;
    }
    if (attempt >= MAX_READINESS_ATTEMPTS) {
      await notifyCrawlerError({
        type: "data_not_ready",
        detail: `数据就绪检测 ${attempt} 次后仍未刷新，停止当日采集`,
        impact: `${date} 数据未采集`,
        action: "等待平台刷新或联系开发",
      });
      return;
    }
    // 重试
    await enqueue<CheckDataReadyPayload>(
      JOB_NAMES.CHECK_DATA_READY,
      { date, basecamp, attempt: attempt + 1 },
      { startAfter: new Date(Date.now() + READINESS_RETRY_INTERVAL_MS) },
    );
    console.log(`[check-data-ready] not ready (attempt=${attempt}), retry in 30 min`);
  } finally {
    await page.close();
  }
}
