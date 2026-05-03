// 抓指定日期的 daily（跳过 readiness）
import { enqueue, JOB_NAMES } from "@/modules/crawler/queue";

const date = process.argv[2] ?? new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
const basecamp = (process.env.DOUYIN_DEFAULT_BASECAMP ?? "cs") as "cs" | "nc1" | "nc2";

async function main(): Promise<void> {
  const id = await enqueue(JOB_NAMES.FETCH_DAILY, { date, basecamp });
  console.log(`fetch_daily enqueued for ${date}: ${id}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
