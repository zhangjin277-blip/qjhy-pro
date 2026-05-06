import "server-only";
import { db } from "@/db/client";
import { schedule_override } from "@/db/schema/schedule-override";
import { dingtalk_user } from "@/db/schema/dingtalk";
import { and, eq } from "drizzle-orm";

export async function listOverridesForAccountDate(account_id: string, date: string) {
  return db
    .select({
      id: schedule_override.id,
      account_id: schedule_override.account_id,
      date: schedule_override.date,
      dingtalk_user_id: schedule_override.dingtalk_user_id,
      anchor_name: dingtalk_user.name,
      time_slots: schedule_override.time_slots,
      reason: schedule_override.reason,
      created_by: schedule_override.created_by,
      created_at: schedule_override.created_at,
    })
    .from(schedule_override)
    .leftJoin(dingtalk_user, eq(schedule_override.dingtalk_user_id, dingtalk_user.user_id))
    .where(and(eq(schedule_override.account_id, account_id), eq(schedule_override.date, date)));
}

export async function listOverridesForAccount(account_id: string) {
  return db
    .select({
      id: schedule_override.id,
      account_id: schedule_override.account_id,
      date: schedule_override.date,
      dingtalk_user_id: schedule_override.dingtalk_user_id,
      anchor_name: dingtalk_user.name,
      time_slots: schedule_override.time_slots,
      reason: schedule_override.reason,
    })
    .from(schedule_override)
    .leftJoin(dingtalk_user, eq(schedule_override.dingtalk_user_id, dingtalk_user.user_id))
    .where(eq(schedule_override.account_id, account_id))
    .orderBy(schedule_override.date);
}
