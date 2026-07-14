import "server-only";
import { db } from "@/db/client";
import { dingtalk_user } from "@/db/schema";
import type { DeleteImpact } from "@/db/schema";
import { sendDingtalkMarkdown } from "@/lib/notify/dingtalk-bot";
import { eq } from "drizzle-orm";

function impactLine(impact: DeleteImpact): string {
  return `剪辑任务 ${impact.editing_tasks} · 开播记录 ${impact.live_sessions} · 投放 ${impact.placement_rows} · 排班 ${impact.schedule_items} · 主播绑定 ${impact.anchor_bindings}`;
}

/** 新删除申请 → 通知审批人（群机器人）。fire-and-forget，内部不抛。 */
export async function notifyDeleteRequested(args: {
  accountName: string;
  product: string;
  requesterName: string;
  reason: string | null;
  impact: DeleteImpact;
}): Promise<void> {
  try {
    const title = `📮 直播账号删除申请：${args.accountName}`;
    const content = [
      `### 📮 直播账号删除申请`,
      "",
      `**账号**：${args.accountName}（${args.product}）`,
      `**申请人**：${args.requesterName}`,
      args.reason ? `**理由**：${args.reason}` : null,
      `**连带删除**：${impactLine(args.impact)}`,
      "",
      "请管理员到「直播账号」页审核。",
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
    await sendDingtalkMarkdown(title, content);
  } catch (err) {
    console.error("[live-account-notify] notifyDeleteRequested failed:", err);
  }
}

/** 审批结果 → 通知申请人（@手机号）。fire-and-forget，内部不抛。 */
export async function notifyDeleteReviewed(args: {
  accountName: string;
  approved: boolean;
  reviewerName: string;
  note: string | null;
  requestedByUserId: string;
}): Promise<void> {
  try {
    const [requester] = await db
      .select({ name: dingtalk_user.name, mobile: dingtalk_user.mobile })
      .from(dingtalk_user)
      .where(eq(dingtalk_user.user_id, args.requestedByUserId));

    const verdict = args.approved ? "✅ 已批准并删除" : "❌ 已驳回";
    const title = `${verdict}：${args.accountName}`;
    const content = [
      `### 直播账号删除申请${args.approved ? "已批准" : "被驳回"}`,
      "",
      `**账号**：${args.accountName}`,
      `**审批人**：${args.reviewerName}`,
      args.note ? `**备注**：${args.note}` : null,
      requester?.mobile ? `@${requester.mobile}` : null,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
    await sendDingtalkMarkdown(title, content, {
      atMobiles: requester?.mobile ? [requester.mobile] : undefined,
    });
  } catch (err) {
    console.error("[live-account-notify] notifyDeleteReviewed failed:", err);
  }
}
