/**
 * 手动跑一次抖音「正在直播」快照同步（验证采集链路 / 补数据用）。
 *
 * NODE_OPTIONS="--conditions=react-server" pnpm tsx --env-file=.env.local scripts/sync-douyin-live-rooms-once.ts
 */
import "dotenv/config";
import { syncDouyinLiveRoomsHandler } from "../src/worker/jobs/handlers/sync-douyin-live-rooms";
import { closeBrowser } from "../src/lib/puppeteer";

async function main(): Promise<void> {
  const result = await syncDouyinLiveRoomsHandler();
  console.log("[once] result:", result);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeBrowser();
    process.exit();
  });
