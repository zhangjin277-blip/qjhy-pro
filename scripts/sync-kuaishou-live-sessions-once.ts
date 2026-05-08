/**
 * 一次性触发快手单场直播同步。支持 history（默认）和 today 两种模式。
 *
 * 用例：
 *   全年回填:        --mode history --from 2026-01-01 --to 2026-05-08
 *   昨日 history 增量: --mode history（默认 D-2 ~ D-1）
 *   今日 today 实时:  --mode today
 *
 * pnpm tsx --env-file=.env.local scripts/sync-kuaishou-live-sessions-once.ts [--mode history|today] [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 */
import "dotenv/config";
import { syncKuaishouHistoryLiveSessionsHandler } from "../src/worker/jobs/handlers/sync-kuaishou-history-live";
import { syncKuaishouTodayLiveSessionsHandler } from "../src/worker/jobs/handlers/sync-kuaishou-today-live";
import { closeBrowser } from "../src/lib/puppeteer";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const mode = arg("--mode") ?? "history";
  const t0 = Date.now();
  try {
    let result: unknown;
    if (mode === "today") {
      result = await syncKuaishouTodayLiveSessionsHandler();
    } else {
      result = await syncKuaishouHistoryLiveSessionsHandler({
        fromDate: arg("--from"),
        toDate: arg("--to"),
      });
    }
    console.log(`[done] mode=${mode} in ${Math.round((Date.now() - t0) / 1000)}s`, result);
  } finally {
    await closeBrowser().catch((err) => {
      console.warn("[close-browser] failed:", err);
    });
    process.exit(0);
  }
}

void main();
