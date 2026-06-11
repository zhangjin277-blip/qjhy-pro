import "server-only";
import { runAttributionJob } from "./job";

export async function runCronAttributionSweep() {
  console.log("[cron-attribution] start");
  // runAttributionJob 内部已分批循环到没有剩余 dirty 行，单次调用即可
  const { processed } = await runAttributionJob({ max_rows: 1000 });
  console.log(`[cron-attribution] done, processed=${processed}`);
}
