import "@/lib/env";

import { registerJob, startScheduler } from "./scheduler";
import { syncDingtalk } from "./jobs/sync-dingtalk";
import { crawlOrchestrator } from "./jobs/crawl-orchestrator";
import { registerCrawlerHandlers } from "./jobs/handlers/register";
import { enqueue, JOB_NAMES, stopBoss } from "@/modules/crawler/server";
import { closeBrowser } from "@/lib/puppeteer";
import { runCronAttributionSweep } from "@/modules/placement-attribution/server";
import { runEditingCleanup } from "./jobs/editing-cleanup";
import { runAnchorPenaltyJob } from "./jobs/anchor-penalty";
import { sweepRetention } from "@/modules/live-recording/server";
import { runPerformanceSweep } from "@/modules/people-performance/server";
// Worker 需要直接调用同步实现；避免导入业务模块 barrel 时把 Server Actions 带入 worker。
// eslint-disable-next-line import/no-restricted-paths
import { syncRecruitmentDatesFromAnchorProfiles } from "@/modules/business-recruitment/auto-match";

// Phase 1: 钉钉同步
// ⚠️ 必须错开整点（02:00:00）：钉钉 /topapi/v2/department/listsub 在整点被全网应用挤爆
// QPS（errcode=88 限流），整点调用必失败、新员工同步不进来。用 02:17 避开整点高峰。
registerJob({
  name: "sync-dingtalk",
  schedule: "17 2 * * *",
  task: syncDingtalk,
});

// Phase 2: 抖音爬虫每日 10:00 入口
registerJob({
  name: "crawl-orchestrator",
  schedule: "0 10 * * *",
  task: crawlOrchestrator,
});

// Phase 2: 抖音爬虫 18:00 补一次
// 有时上午 10:00 抖音后台数据还没刷新出来，下午补跑一次拉最新版本。
// 下游 fetch job 全部 UPSERT 幂等，重复跑无副作用，仅覆盖更新字段。
registerJob({
  name: "crawl-orchestrator-evening",
  schedule: "0 18 * * *",
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

// 快手 666 trend 接口拉一场分时累计（1 min/点，整场全部历史）。
// 5 min 跑一次足够（每次同房间多次 UPSERT 自动去重），写 kuaishou_live_trend。
// singletonKey 防重叠。
registerJob({
  name: "sync-kuaishou-live-snapshot",
  schedule: "*/5 * * * *",
  task: async () => {
    await enqueue(JOB_NAMES.SYNC_KUAISHOU_LIVE_SNAPSHOT, {}, { singletonKey: "ks-trend-sync" });
  },
});

// 抖音公会「正在直播」快照（union get_room_by_label）→ douyin_live_room。
// 平面图抖音在播 + 实际开播时间（迟到判定）依赖这条链。singletonKey 防重叠。
registerJob({
  name: "sync-douyin-live-rooms",
  schedule: "*/5 * * * *",
  task: async () => {
    await enqueue(JOB_NAMES.SYNC_DOUYIN_LIVE_ROOMS, {}, { singletonKey: "dy-live-rooms-sync" });
  },
});

// 抖音视频快照（每天 12:00）：仅"线下运营"组带的主播，近 30 天滑动窗口
registerJob({
  name: "fetch-video",
  schedule: "0 12 * * *",
  task: async () => {
    await enqueue(JOB_NAMES.FETCH_VIDEO, { basecamp: "cs" });
  },
});

// 线上招募日期每日中午刷新：使用当天最新的主播档案，补齐空的入会/首次开播日期。
registerJob({
  name: "sync-recruitment-dates",
  schedule: "0 12 * * *",
  task: async () => {
    const result = await syncRecruitmentDatesFromAnchorProfiles();
    console.log(`[sync-recruitment-dates] done`, result);
  },
});

// 造化仙府官号灵机下播复盘（每日拉前一天，支持监控页范围补数）。
registerJob({
  name: "sync-zhaohua-official-replays",
  schedule: "30 10 * * *",
  task: async () => {
    await enqueue(JOB_NAMES.SYNC_ZHAOHUA_OFFICIAL_REPLAYS, {});
  },
});

// 剪辑任务软删文件清理（每天 03:00，物理删除 30 天前软删的任务及关联文件）
registerJob({
  name: "editing-cleanup",
  schedule: "0 3 * * *",
  task: async () => {
    const r = await runEditingCleanup();
    console.log(`[editing-cleanup] tasks=${r.tasksRemoved} files=${r.filesRemoved}`);
  },
});

// 捕鱼系主播扣分（每天 02:00，处理昨天开播但未上传素材的主播）
registerJob({
  name: "anchor-penalty",
  schedule: "0 2 * * *",
  task: runAnchorPenaltyJob,
});

// 直播录像保存时长自动清理（每小时 15 分，删除超过各主播保存天数的录像；永久=跳过）
// 依赖 worker 容器挂载 RECORDINGS_DIR + URLS_FILE(见 docker-compose worker.volumes)
registerJob({
  name: "live-recording-retention",
  schedule: "15 * * * *",
  task: async () => {
    if (!process.env.RECORDINGS_DIR || !process.env.URLS_FILE) return; // 未挂载则不跑
    const r = await sweepRetention();
    if (r.deleted > 0) {
      const mb = (r.freedBytes / 1024 ** 2).toFixed(0);
      console.log(`[live-recording-retention] 删除 ${r.deleted} 个录像,释放 ${mb} MB`);
    }
  },
});

registerJob({
  name: "people-performance-sweep",
  schedule: "0 9 * * *",
  task: async () => {
    const result = await runPerformanceSweep();
    console.log(
      `[people-performance] opened=${result.opened} selfReviewsOpened=${result.selfReviewsOpened} reminders=${result.reminders}`,
    );
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
