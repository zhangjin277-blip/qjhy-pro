import "@/lib/env"; // 验证 env

import { registerJob, startScheduler } from "./scheduler";

// Phase 0 占位 job：每分钟打个心跳，证明 worker 在跑
registerJob({
  name: "heartbeat",
  schedule: "* * * * *",
  task: async () => {
    console.log(`[heartbeat] ${new Date().toISOString()}`);
  },
});

// Phase 1 / 2 会在这里 register 钉钉同步、爬虫等任务

console.log("[worker] qjhy-pro worker starting");
startScheduler();

process.on("SIGTERM", () => {
  console.log("[worker] SIGTERM received, shutting down");
  process.exit(0);
});
