import "server-only";
import { runAttributionJob } from "./job";

export async function runCronAttributionSweep() {
  console.log("[cron-attribution] start");
  let total = 0;
  while (true) {
    const r = await runAttributionJob({ max_rows: 1000 });
    if (r.processed === 0) break;
    total += r.processed;
  }
  console.log(`[cron-attribution] done, processed=${total}`);
}
