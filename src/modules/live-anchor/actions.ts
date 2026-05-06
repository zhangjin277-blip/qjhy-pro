"use server";
import { db } from "@/db/client";
import { live_anchor } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/admin-guard";
import { AppError } from "@/lib/errors";
import { eq } from "drizzle-orm";
import { UpsertAnchorInput } from "./schema";

export async function upsertAnchor(input: unknown) {
  const data = UpsertAnchorInput.parse(input);
  const { userId } = await requireAdmin();

  const [before] = await db
    .select()
    .from(live_anchor)
    .where(eq(live_anchor.dingtalk_user_id, data.dingtalk_user_id));

  const values = {
    dingtalk_user_id: data.dingtalk_user_id,
    business_line: data.business_line,
    employment_type: data.employment_type,
    work_status: data.work_status,
    trial_start_date: data.trial_start_date ?? null,
    contract_date: data.contract_date ?? null,
    leave_date: data.leave_date ?? null,
    external_name: data.external_name ?? null,
    updated_at: new Date(),
  };

  const [upserted] = await db
    .insert(live_anchor)
    .values(values)
    .onConflictDoUpdate({
      target: live_anchor.dingtalk_user_id,
      set: {
        business_line: values.business_line,
        employment_type: values.employment_type,
        work_status: values.work_status,
        trial_start_date: values.trial_start_date,
        contract_date: values.contract_date,
        leave_date: values.leave_date,
        external_name: values.external_name,
        updated_at: values.updated_at,
      },
    })
    .returning();

  await writeAuditLog({
    user_id: userId,
    action: before ? "LIVE_ANCHOR_UPDATED" : "LIVE_ANCHOR_CREATED",
    target_type: "live_anchor",
    target_id: data.dingtalk_user_id,
    before: before ?? null,
    after: upserted,
  });

  return upserted;
}

export async function deleteAnchor(input: unknown) {
  const { dingtalk_user_id } = UpsertAnchorInput.pick({ dingtalk_user_id: true }).parse(input);
  const { userId } = await requireAdmin();

  const [before] = await db
    .select()
    .from(live_anchor)
    .where(eq(live_anchor.dingtalk_user_id, dingtalk_user_id));
  if (!before) throw new AppError("LIVE_ANCHOR_NOT_FOUND", "主播档案不存在", 404);

  await db.delete(live_anchor).where(eq(live_anchor.dingtalk_user_id, dingtalk_user_id));

  await writeAuditLog({
    user_id: userId,
    action: "LIVE_ANCHOR_DELETED",
    target_type: "live_anchor",
    target_id: dingtalk_user_id,
    before,
  });

  return { ok: true } as const;
}
