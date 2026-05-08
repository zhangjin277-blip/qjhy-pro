"use server";
import { db } from "@/db/client";
import { live_account, placement_row, schedule_override } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/admin-guard";
import { AppError } from "@/lib/errors";
import { eq, count } from "drizzle-orm";
import { UpsertAccountInput, DeleteAccountInput } from "./schema";

export async function upsertAccount(input: unknown) {
  const data = UpsertAccountInput.parse(input);
  const { userId } = await requireAdmin();

  const id = data.id ?? crypto.randomUUID();
  const isUpdate = Boolean(data.id);

  let before: typeof live_account.$inferSelect | null = null;
  if (isUpdate) {
    const rows = await db.select().from(live_account).where(eq(live_account.id, id));
    before = rows[0] ?? null;
    if (!before) throw new AppError("LIVE_ACCOUNT_NOT_FOUND", "直播账号不存在", 404);
  }

  const values = {
    id,
    account_name: data.account_name,
    platform: data.platform,
    platform_account_id: data.platform_account_id ?? null,
    platform_uid: data.platform_uid ?? null,
    platform_real_name: data.platform_real_name ?? null,
    phone: data.phone ?? null,
    phone_index: data.phone_index ?? null,
    phone_real_name: data.phone_real_name ?? null,
    room_id: data.room_id ?? null,
    game_account_1: data.game_account_1 ?? null,
    game_account_2: data.game_account_2 ?? null,
    game_account_3: data.game_account_3 ?? null,
    product: data.product,
    agent_dingtalk_user_id: data.agent_dingtalk_user_id ?? null,
    placement_label: data.placement_label ?? null,
    live_status: data.live_status,
    updated_at: new Date(),
  };

  let result;
  if (isUpdate) {
    [result] = await db.update(live_account).set(values).where(eq(live_account.id, id)).returning();
  } else {
    [result] = await db.insert(live_account).values(values).returning();
  }

  await writeAuditLog({
    user_id: userId,
    action: isUpdate ? "LIVE_ACCOUNT_UPDATED" : "LIVE_ACCOUNT_CREATED",
    target_type: "live_account",
    target_id: id,
    before,
    after: result,
  });

  return result;
}

export async function deleteAccount(input: unknown) {
  const { id } = DeleteAccountInput.parse(input);
  const { userId } = await requireAdmin();

  const [before] = await db.select().from(live_account).where(eq(live_account.id, id));
  if (!before) throw new AppError("LIVE_ACCOUNT_NOT_FOUND", "直播账号不存在", 404);

  const [placementCount] = await db
    .select({ n: count() })
    .from(placement_row)
    .where(eq(placement_row.live_account_id, id));
  if (placementCount && placementCount.n > 0) {
    throw new AppError(
      "LIVE_ACCOUNT_HAS_PLACEMENTS",
      `该账号有 ${placementCount.n} 条投放历史数据，无法删除。请先在投放页清理或迁移这些数据。`,
      409,
    );
  }

  await db.delete(schedule_override).where(eq(schedule_override.account_id, id));
  await db.delete(live_account).where(eq(live_account.id, id));

  await writeAuditLog({
    user_id: userId,
    action: "LIVE_ACCOUNT_DELETED",
    target_type: "live_account",
    target_id: id,
    before,
  });

  return { ok: true } as const;
}
