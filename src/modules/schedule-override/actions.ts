"use server";
import { db } from "@/db/client";
import { schedule_override } from "@/db/schema/schedule-override";
import { auth } from "@/lib/auth";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { markDirtyByAccountDate, runAttributionJob } from "@/modules/placement-attribution/server";
import { resolvePermission } from "@/modules/permissions/server";
import { writeAuditLog } from "@/lib/audit/log";
import { overrideInputSchema } from "./schema";
import { revalidatePath } from "next/cache";

/**
 * 校验当前用户具备排班编辑权限点（live_account.schedule_edit）。
 * emergency 后门直接通过。
 */
async function requireScheduleWrite(): Promise<{
  authUserId: string;
  dingtalkUserId: string;
}> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("UNAUTHORIZED");
  const currentUser = await getCurrentDingtalkUser();
  if (currentUser.kind !== "ok") throw new Error("AUTH_USER_NOT_SYNCED");
  if (!currentUser.isEmergency) {
    const perm = await resolvePermission(currentUser.dingtalkUserId, "live_account");
    if (!perm.points.has("schedule_edit")) throw new Error("FORBIDDEN");
  }
  return { authUserId: session.user.id, dingtalkUserId: currentUser.dingtalkUserId };
}

export async function createOverride(input: unknown) {
  const { authUserId, dingtalkUserId } = await requireScheduleWrite();
  const parsed = overrideInputSchema.parse(input);

  const [row] = await db
    .insert(schedule_override)
    .values({
      account_id: parsed.account_id,
      date: parsed.date,
      dingtalk_user_id: parsed.dingtalk_user_id,
      time_slots: parsed.time_slots,
      reason: parsed.reason ?? null,
      created_by: authUserId,
    })
    .returning();

  await markDirtyByAccountDate(parsed.account_id, parsed.date);
  await runAttributionJob({ max_rows: 200 });

  await writeAuditLog({
    user_id: dingtalkUserId,
    action: "SCHEDULE_OVERRIDE_CREATE",
    target_type: "schedule_override",
    target_id: row?.id ?? null,
    after: {
      account_id: parsed.account_id,
      date: parsed.date,
      dingtalk_user_id: parsed.dingtalk_user_id,
      time_slots: parsed.time_slots,
      reason: parsed.reason ?? null,
    },
  });

  revalidatePath("/live-accounts");
  revalidatePath("/placements");
}

export async function deleteOverride(id: string) {
  const { dingtalkUserId } = await requireScheduleWrite();

  const [removed] = await db
    .delete(schedule_override)
    .where(eq(schedule_override.id, id))
    .returning();

  if (removed) {
    await markDirtyByAccountDate(removed.account_id, removed.date);
    await runAttributionJob({ max_rows: 200 });

    await writeAuditLog({
      user_id: dingtalkUserId,
      action: "SCHEDULE_OVERRIDE_DELETE",
      target_type: "schedule_override",
      target_id: id,
      before: {
        account_id: removed.account_id,
        date: removed.date,
        dingtalk_user_id: removed.dingtalk_user_id,
        time_slots: removed.time_slots,
        reason: removed.reason,
      },
    });
  }

  revalidatePath("/live-accounts");
  revalidatePath("/placements");
}
