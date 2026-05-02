import { enqueue, JOB_NAMES } from "@/modules/crawler/server";

/**
 * 每天 10:00 入口：仅 enqueue check-data-ready 守护 job。
 * 守护 job 自己负责重试 + 触发下游。
 */
export async function crawlOrchestrator(): Promise<void> {
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  const basecamp = (process.env.DOUYIN_DEFAULT_BASECAMP ?? "cs") as "cs" | "nc1" | "nc2";
  await enqueue(JOB_NAMES.CHECK_DATA_READY, { date: yesterday, basecamp, attempt: 1 });
  console.log(`[crawl-orchestrator] enqueued check-data-ready for ${yesterday}`);
}
