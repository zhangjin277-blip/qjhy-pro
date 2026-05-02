// 手动 enqueue check-data-ready 抓昨天数据
import { enqueue, JOB_NAMES, stopBoss } from "@/modules/crawler/server";

const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
const basecamp = (process.env.DOUYIN_DEFAULT_BASECAMP ?? "cs") as "cs" | "nc1" | "nc2";

async function main(): Promise<void> {
  const id = await enqueue(JOB_NAMES.CHECK_DATA_READY, {
    date: yesterday,
    basecamp,
    attempt: 1,
  });
  console.log(`enqueued: ${id} for date=${yesterday} basecamp=${basecamp}`);
  await stopBoss();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
