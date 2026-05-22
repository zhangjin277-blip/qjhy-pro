"use server";
import { db } from "@/db/client";
import { dingtalk_user, live_account, placement_row, schedule_override } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/admin-guard";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { getManagedDeptIds, resolvePermission } from "@/modules/permissions/server";
import { AppError } from "@/lib/errors";
import { count, eq, sql } from "drizzle-orm";
import { UpsertAccountInput, DeleteAccountInput } from "./schema";

/**
 * 检查当前用户对某账号是否可写：
 * - emergency / admin → 直接 true
 * - can_edit === false → false（连权限位都没）
 * - scope=all → true；scope=team → 看 target agent 是否在 team；scope=self → 看 target agent = userId
 * - delegated 非空 → target agent ∈ delegated
 * - 新建场景（targetAgent=undefined）→ 只看 can_edit
 */
async function canWriteAccount(
  userId: string,
  isEmergency: boolean,
  targetAgent: string | null | undefined,
): Promise<boolean> {
  if (isEmergency) return true;
  const perm = await resolvePermission(userId, "live_account");
  if (!perm.can_edit) return false;

  // 新建账号：只校验 can_edit（还不存在的账号没 scope 可比）
  if (targetAgent === undefined) return true;

  if (perm.delegatedUserIds && perm.delegatedUserIds.length > 0) {
    return targetAgent !== null && perm.delegatedUserIds.includes(targetAgent);
  }
  if (perm.scope === "all") return true;
  if (perm.scope === "self") return targetAgent === userId;
  if (perm.scope === "team") {
    if (!targetAgent) return false;
    const deptIds = await getManagedDeptIds(userId);
    if (deptIds.length === 0) return false;
    const literal = deptIds.map((d) => `'${d.replace(/'/g, "''")}'`).join(",");
    const [hit] = await db
      .select({ user_id: dingtalk_user.user_id })
      .from(dingtalk_user)
      .where(
        sql`${dingtalk_user.user_id} = ${targetAgent} AND ${dingtalk_user.dept_ids} ?| ARRAY[${sql.raw(literal)}]::text[]`,
      );
    return !!hit;
  }
  return false;
}

export async function upsertAccount(input: unknown) {
  const data = UpsertAccountInput.parse(input);
  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind !== "ok") throw new AppError("AUTH_FORBIDDEN", "未登录或未同步钉钉身份", 403);
  const userId = ctx.dingtalkUserId;

  const id = data.id ?? crypto.randomUUID();
  const isUpdate = Boolean(data.id);

  let before: typeof live_account.$inferSelect | null = null;
  if (isUpdate) {
    const rows = await db.select().from(live_account).where(eq(live_account.id, id));
    before = rows[0] ?? null;
    if (!before) throw new AppError("LIVE_ACCOUNT_NOT_FOUND", "直播账号不存在", 404);
  }

  // 权限：新建查 can_edit；更新查 can_edit + 目标账号在 scope 内
  const targetAgent: string | null | undefined = isUpdate
    ? (before?.agent_dingtalk_user_id ?? null)
    : undefined;
  const canWrite = await canWriteAccount(userId, ctx.isEmergency, targetAgent);
  if (!canWrite) {
    throw new AppError("AUTH_FORBIDDEN", "无权编辑该直播账号", 403);
  }
  // 若修改 agent 字段 → 新 agent 也要在 scope 内（防止把账号转给 scope 外）
  if (isUpdate && data.agent_dingtalk_user_id !== undefined) {
    const newAgent = data.agent_dingtalk_user_id ?? null;
    if (newAgent !== targetAgent) {
      const canMoveTo = await canWriteAccount(userId, ctx.isEmergency, newAgent);
      if (!canMoveTo) {
        throw new AppError("AUTH_FORBIDDEN", "无权把账号转给 scope 外的运营", 403);
      }
    }
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
