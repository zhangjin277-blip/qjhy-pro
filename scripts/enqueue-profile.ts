// 跳过 readiness 直接拉主播档案
import { enqueue, JOB_NAMES, stopBoss } from "@/modules/crawler/server";

const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
const basecamp = (process.env.DOUYIN_DEFAULT_BASECAMP ?? "cs") as "cs" | "nc1" | "nc2";

async function main(): Promise<void> {
  const id1 = await enqueue(JOB_NAMES.FETCH_PROFILE, { date: yesterday, basecamp });
  console.log(`fetch_profile enqueued: ${id1}`);
  const id2 = await enqueue(JOB_NAMES.FETCH_DAILY, { date: yesterday, basecamp });
  console.log(`fetch_daily enqueued: ${id2}`);
  await stopBoss();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
