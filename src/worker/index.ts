import "@/lib/env";

import { registerJob, startScheduler } from "./scheduler";
import { syncDingtalk } from "./jobs/sync-dingtalk";
import { crawlOrchestrator } from "./jobs/crawl-orchestrator";
import { registerCrawlerHandlers } from "./jobs/handlers/register";
import { syncKuaishouMembersHandler } from "./jobs/handlers/sync-kuaishou-members";
import { syncKuaishouHistoryLiveSessionsHandler } from "./jobs/handlers/sync-kuaishou-history-live";
import { syncKuaishouTodayLiveSessionsHandler } from "./jobs/handlers/sync-kuaishou-today-live";
import { stopBoss } from "@/modules/crawler/server";
import { closeBrowser } from "@/lib/puppeteer";
import { runCronAttributionSweep } from "@/modules/placement-attribution/server";

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

// Phase 2.2: 归因兜底（每天 04:00 扫 dirty 行）
registerJob({
  name: "attribution-sweep",
  schedule: "0 4 * * *",
  task: runCronAttributionSweep,
});

// Phase 2.3a: 快手公会成员同步（每日 02:30，比钉钉晚 30min 避开瞬时高峰）
registerJob({
  name: "sync-kuaishou-members",
  schedule: "30 2 * * *",
  task: async () => {
    await syncKuaishouMembersHandler();
  },
});

// Phase 2.3b: 快手 history 直播数据（每日 03:00，跑 D-2 ~ D-1）
registerJob({
  name: "sync-kuaishou-history-live",
  schedule: "0 3 * * *",
  task: async () => {
    await syncKuaishouHistoryLiveSessionsHandler();
  },
});

// Phase 2.3b: 快手 today 实时直播（每 30 分钟）
registerJob({
  name: "sync-kuaishou-today-live",
  schedule: "*/30 * * * *",
  task: async () => {
    await syncKuaishouTodayLiveSessionsHandler();
  },
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
