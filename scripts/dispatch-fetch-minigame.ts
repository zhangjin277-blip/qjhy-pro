// 重跑 fetch-minigame 验证 JSON 模式
import { enqueue, JOB_NAMES } from "@/modules/crawler/queue";
async function main(): Promise<void> {
  const date = process.env.DATE ?? "2026-05-02";
  const id = await enqueue(JOB_NAMES.FETCH_MINIGAME, { date, basecamp: "cs" as const });
  console.log({ minigame: id });
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
