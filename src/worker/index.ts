import "@/lib/env";

import { registerJob, startScheduler } from "./scheduler";
import { syncDingtalk } from "./jobs/sync-dingtalk";
import { crawlOrchestrator } from "./jobs/crawl-orchestrator";
import { registerCrawlerHandlers } from "./jobs/handlers/register";
import { stopBoss } from "@/modules/crawler/server";
import { closeBrowser } from "@/lib/puppeteer";

// Phase 1: 钉钉同步
registerJob({
  name: "sync-dingtalk",
  schedule: "0 2 * * *",
  task: syncDingtalk,
});

// Phase 2: 抖音爬虫每日 10:00 入口
registerJob({
  name: "crawl-orchestrator",
  schedule: "0 10 * * *",
  task: crawlOrchestrator,
});

registerJob({
  name: "heartbeat",
  schedule: "0 * * * *",
  task: async () => {
    console.log(`[heartbeat] ${new Date().toISOString()}`);
  },
});

(async () => {
  console.log("[worker] qjhy-pro worker starting");
  await registerCrawlerHandlers();
  startScheduler();
})();

const shutdown = async () => {
  console.log("[worker] shutting down");
  await stopBoss();
  await closeBrowser();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
