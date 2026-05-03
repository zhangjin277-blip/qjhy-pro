// 重跑 fetch-game 验证 video+cps / video+cps_all fields 是否命中
import { enqueue, JOB_NAMES } from "@/modules/crawler/queue";
async function main(): Promise<void> {
  const date = process.env.DATE ?? "2026-05-01";
  const id = await enqueue(JOB_NAMES.FETCH_GAME, { date, basecamp: "cs" as const });
  console.log({ game: id });
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
