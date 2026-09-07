"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { operation_monthly_target } from "@/db/schema";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import { SaveOperationTargetInput } from "./schema";

export async function saveOperationTarget(formData: FormData): Promise<void> {
  const identity = await getCurrentDingtalkUser();
  if (identity.kind !== "ok") throw new Error("请先登录");
  if (!identity.isEmergency) {
    const permission = await resolvePermission(identity.dingtalkUserId, "dashboard");
    if (permission.scope !== "all") throw new Error("无权配置运营目标");
  }
  const input = SaveOperationTargetInput.parse(Object.fromEntries(formData));
  await db
    .insert(operation_monthly_target)
    .values({
      user_id: input.userId,
      month: input.month,
      fan_ticket_target: String(input.fanTicketTarget),
      flow_target: String(input.flowTarget),
      active_anchor_target: String(input.activeAnchorTarget),
      updated_by_user_id: identity.dingtalkUserId,
    })
    .onConflictDoUpdate({
      target: [operation_monthly_target.user_id, operation_monthly_target.month],
      set: {
        fan_ticket_target: String(input.fanTicketTarget),
        flow_target: String(input.flowTarget),
        active_anchor_target: String(input.activeAnchorTarget),
        updated_by_user_id: identity.dingtalkUserId,
        updated_at: new Date(),
      },
    });
  revalidatePath("/operations-performance");
}
