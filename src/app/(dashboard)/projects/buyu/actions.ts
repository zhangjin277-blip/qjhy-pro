"use server";

import { requirePoint } from "@/lib/admin-guard";
import { writeAuditLog } from "@/lib/audit";
// Import the queue module directly. The crawler server barrel also re-exports
// Puppeteer-backed adapters, which cannot be statically analyzed by Next's
// production webpack build when pulled into a Server Action.
// eslint-disable-next-line import/no-restricted-paths -- Keep this Server Action free of Puppeteer adapters.
import { enqueue, JOB_NAMES } from "@/modules/crawler/queue";

export async function triggerBuyuDailyPlacementImport(): Promise<{
  ok: boolean;
  jobId?: string | null;
  error?: string;
}> {
  try {
    const { userId } = await requirePoint("placement", "upload");
    const jobId = await enqueue(
      JOB_NAMES.SYNC_DINGTALK_PLACEMENT_DAILY,
      {},
      { singletonKey: "dingtalk-placement-daily-import" },
    );
    await writeAuditLog({
      user_id: userId,
      action: "DINGTALK_PLACEMENT_DAILY_MANUAL_TRIGGER",
      target_type: "crawler_job",
      target_id: jobId ?? "unknown",
      after: { job_name: JOB_NAMES.SYNC_DINGTALK_PLACEMENT_DAILY },
    });
    return { ok: true, jobId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "提交拉取任务失败" };
  }
}
