import "server-only";
import { db } from "@/db/client";
import { editing_task, live_account, anchor_profile, dingtalk_user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendDingtalkMarkdown } from "@/lib/notify/dingtalk-bot";

/**
 * 紧急任务创建时发钉钉通知。
 * 调用方 fire-and-forget（.catch(() => {})），本函数内部不抛。
 */
export async function notifyUrgentTaskCreated(
  taskId: number,
  reason: string | null,
): Promise<void> {
  try {
    const [t] = await db
      .select({
        account_name: live_account.account_name,
        anchor_name: anchor_profile.nick_name,
        product: live_account.product,
        created_by_name: dingtalk_user.name,
        material_date: editing_task.material_date,
      })
      .from(editing_task)
      .leftJoin(live_account, eq(live_account.id, editing_task.live_account_id))
      .leftJoin(anchor_profile, eq(anchor_profile.anchor_id, editing_task.anchor_id))
      .leftJoin(dingtalk_user, eq(dingtalk_user.user_id, editing_task.created_by_user_id))
      .where(eq(editing_task.id, taskId));

    if (!t) return;

    const dateStr = t.material_date.toISOString().slice(0, 10);
    const title = `🔴 剪辑加急任务 #${taskId}`;
    const content = [
      `### 🔴 剪辑加急任务 #${taskId}`,
      "",
      `**账号**：${t.account_name ?? "(未知)"}`,
      t.anchor_name ? `**主播**：${t.anchor_name}` : null,
      `**产品**：${t.product ?? "未分类"}`,
      `**素材日期**：${dateStr}`,
      `**创建人**：${t.created_by_name ?? "(unknown)"}`,
      reason ? `**紧急原因**：${reason}` : null,
      "",
      "请尽快派单并完成剪辑。",
    ]
      .filter((line): line is string => line !== null)
      .join("\n");

    await sendDingtalkMarkdown(title, content, { isAtAll: true });
  } catch (err) {
    console.error("[editing-notify] notifyUrgentTaskCreated failed:", err);
  }
}

/**
 * 紧急任务上传成品（editing → review）时发钉钉通知。
 * 调用方 fire-and-forget（.catch(() => {})），本函数内部不抛。
 */
export async function notifyUrgentEditedUploaded(taskId: number): Promise<void> {
  try {
    const [t] = await db
      .select({
        account_name: live_account.account_name,
        product: live_account.product,
        editor_name: dingtalk_user.name,
      })
      .from(editing_task)
      .leftJoin(live_account, eq(live_account.id, editing_task.live_account_id))
      .leftJoin(dingtalk_user, eq(dingtalk_user.user_id, editing_task.editor_user_id))
      .where(eq(editing_task.id, taskId));

    if (!t) return;

    const title = `✅ 加急成品完成 #${taskId}`;
    const content = [
      `### ✅ 加急成品完成 #${taskId}`,
      "",
      `**账号**：${t.account_name ?? "(未知)"}`,
      `**产品**：${t.product ?? "未分类"}`,
      `**剪辑师**：${t.editor_name ?? "(unknown)"}`,
      "",
      "请审核人尽快审核。",
    ].join("\n");

    await sendDingtalkMarkdown(title, content);
  } catch (err) {
    console.error("[editing-notify] notifyUrgentEditedUploaded failed:", err);
  }
}
