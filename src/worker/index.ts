import "@/lib/env"; // 验证 env

import { registerJob, startScheduler } from "./scheduler";
import { syncDingtalk } from "./jobs/sync-dingtalk";

// 每天凌晨 02:00 全量同步钉钉组织架构
registerJob({
  name: "sync-dingtalk",
  schedule: "0 2 * * *",
  task: syncDingtalk,
});

// 心跳 job，每小时一次（证明 worker 进程活着）
registerJob({
  name: "heartbeat",
  schedule: "0 * * * *",
  task: async () => {
    console.log(`[heartbeat] ${new Date().toISOString()}`);
  },
});

console.log("[worker] qjhy-pro worker starting");
startScheduler();

process.on("SIGTERM", () => {
  console.log("[worker] SIGTERM received, shutting down");
  process.exit(0);
});
