/**
 * 一次性脚本：手动触发钉钉同步（绕过 02:00 整点 QPS 限流）。
 *
 * Usage（NAS worker 容器内）：
 *   docker exec qjhy-worker pnpm exec tsx scripts/sync-dingtalk-once.ts
 */
import { syncDingtalk } from "@/worker/jobs/sync-dingtalk";

async function main() {
  await syncDingtalk();
  console.log("[sync-dingtalk-once] done");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
