import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  dingtalk_user,
  performance_cycle,
  performance_notification,
  type PerformanceStage,
} from "@/db/schema";
import { sendWorkNotification } from "@/lib/dingtalk";
import { env } from "@/lib/env";
import { resolvePermission } from "@/modules/permissions/server";

import { STAGE_LABEL } from "./state-machine";

async function calibrationRecipients(): Promise<string[]> {
  const users = await db
    .select({ userId: dingtalk_user.user_id })
    .from(dingtalk_user)
    .where(eq(dingtalk_user.active, true));
  const checked = await Promise.all(
    users.map(async ({ userId }) => ({
      userId,
      permission: await resolvePermission(userId, "people_performance"),
    })),
  );
  return checked.filter((row) => row.permission.points.has("calibrate")).map((row) => row.userId);
}

async function recipientsForStage(
  cycle: typeof performance_cycle.$inferSelect,
  stage: PerformanceStage,
): Promise<string[]> {
  if (stage === "goal_setting" || stage === "self_review" || stage === "employee_confirm") {
    return [cycle.user_id];
  }
  if (stage === "goal_review" || stage === "manager_review") {
    return cycle.manager_user_id ? [cycle.manager_user_id] : [];
  }
  if (stage === "skip_manager_review") {
    return cycle.skip_manager_user_id ? [cycle.skip_manager_user_id] : [];
  }
  if (stage === "hr_calibration") return calibrationRecipients();
  return [];
}

export async function notifyCycleStage(
  cycleId: string,
  stage: PerformanceStage,
  dedupeKey: string,
): Promise<void> {
  const [cycle] = await db
    .select()
    .from(performance_cycle)
    .where(eq(performance_cycle.id, cycleId));
  if (!cycle) return;
  const recipients = await recipientsForStage(cycle, stage);
  for (const recipient of recipients) {
    const [delivery] = await db
      .insert(performance_notification)
      .values({
        cycle_id: cycleId,
        recipient_user_id: recipient,
        dedupe_key: dedupeKey,
        status: "pending",
      })
      .onConflictDoNothing()
      .returning();
    if (!delivery) continue;
    try {
      const sent = await sendWorkNotification({
        userIds: [recipient],
        title: `${cycle.label}待处理`,
        content: `当前环节：${STAGE_LABEL[stage]}\n考核周期：${cycle.period_start} 至 ${cycle.period_end}`,
        url: `${env.NEXT_PUBLIC_APP_URL}/people-performance?user=${encodeURIComponent(cycle.user_id)}`,
      });
      await db
        .update(performance_notification)
        .set({ status: sent ? "sent" : "skipped", sent_at: sent ? new Date() : null })
        .where(eq(performance_notification.id, delivery.id));
    } catch (error) {
      await db
        .update(performance_notification)
        .set({
          status: "failed",
          error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
        })
        .where(eq(performance_notification.id, delivery.id));
    }
  }
}
