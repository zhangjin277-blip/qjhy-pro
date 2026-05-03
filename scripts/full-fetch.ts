// 一次性派发 5/2 全流程：fetch-profile + fetch-daily（fetch-daily 完成后自动触发 portrait/game/minigame）
import { enqueue, JOB_NAMES } from "@/modules/crawler/queue";
async function main(): Promise<void> {
  const date = process.env.DATE ?? "2026-05-02";
  const basecamp = "cs" as const;
  console.log(`[full-fetch] start at ${new Date().toISOString()}, date=${date}`);
  const id1 = await enqueue(JOB_NAMES.FETCH_PROFILE, { date, basecamp });
  const id2 = await enqueue(JOB_NAMES.FETCH_DAILY, { date, basecamp });
  console.log(JSON.stringify({ profile: id1, daily: id2 }));
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
