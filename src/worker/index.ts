import "@/lib/env";

import { registerJob, startScheduler } from "./scheduler";
import { syncDingtalk } from "./jobs/sync-dingtalk";
import { crawlOrchestrator } from "./jobs/crawl-orchestrator";
import { registerCrawlerHandlers } from "./jobs/handlers/register";
import { enqueue, JOB_NAMES, stopBoss } from "@/modules/crawler/server";
import { closeBrowser } from "@/lib/puppeteer";
import { runCronAttributionSweep } from "@/modules/placement-attribution/server";
import { syncLegacyCsPlacement } from "./jobs/sync-legacy-cs-placement";

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
// cron → enqueue → pg-boss handler，与抖音模式一致，确保 admin/crawler 队列页可见
registerJob({
  name: "sync-kuaishou-members",
  schedule: "30 2 * * *",
  task: async () => {
    await enqueue(JOB_NAMES.SYNC_KUAISHOU_MEMBERS, {});
  },
});

// Phase 2.3b: 快手 history 直播数据（每日 11:00，跑 D-2 ~ D-1）
// 快手 history API 一般上午 10 点才更新昨天数据，11 点跑能拉到完整数据
registerJob({
  name: "sync-kuaishou-history-live",
  schedule: "0 11 * * *",
  task: async () => {
    await enqueue(JOB_NAMES.SYNC_KUAISHOU_HISTORY_LIVE, {});
  },
});

// Phase 2.3b: 快手 today 实时直播（每 30 分钟）
registerJob({
  name: "sync-kuaishou-today-live",
  schedule: "*/30 * * * *",
  task: async () => {
    await enqueue(JOB_NAMES.SYNC_KUAISHOU_TODAY_LIVE, {});
  },
});

// Phase 2.4: 老中台（miracle-pro-cs SQLite）→ 本中台捕鱼投放增量同步（每小时整点）
// 读 /app/legacy.sqlite 最近 7 天 product_buyu 行，upsert 到 placement_row。
registerJob({
  name: "sync-legacy-cs-placement",
  schedule: "5 * * * *",
  task: syncLegacyCsPlacement,
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
