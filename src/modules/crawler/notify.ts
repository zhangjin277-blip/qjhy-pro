import "server-only";
import { notifyError } from "@/lib/notify"; // Phase 1 已有
import { isNotificationEnabled } from "@/lib/notify/settings";

export async function notifyCrawlerError(opts: {
  type: "data_not_ready" | "cookie_expired" | "job_failed" | "db_unreachable";
  detail: string;
  impact?: string;
  action?: string;
}): Promise<void> {
  if (!(await isNotificationEnabled("crawler_error"))) return;
  const lines = [
    `[Phase2 报错] ${opts.type}`,
    `时间: ${new Date().toISOString()}`,
    `详情: ${opts.detail}`,
  ];
  if (opts.impact) lines.push(`影响: ${opts.impact}`);
  if (opts.action) lines.push(`处理: ${opts.action}`);
  await notifyError(lines.join("\n"));
}
