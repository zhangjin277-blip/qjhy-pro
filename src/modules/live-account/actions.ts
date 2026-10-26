"use server";
import { db } from "@/db/client";
import { dingtalk_user, live_account, live_session_log } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { getManagedDeptIds, resolvePermission } from "@/modules/permissions/server";
import { AppError } from "@/lib/errors";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { UpsertAccountInput, DeprecateAccountInput, RestoreAccountInput } from "./schema";

/**
 * 检查当前用户对某账号是否可写：
 * - emergency / admin → 直接 true
 * - 无 account_edit 权限点 → false
 * - scope=all → true；scope=team → 看 target agent 是否在 team；scope=self → 看 target agent = userId
 * - delegated 非空 → target agent ∈ delegated
 * - 新建场景（targetAgent=undefined）→ 只看 account_edit
 */
async function canWriteAccount(
  userId: string,
  isEmergency: boolean,
  targetAgent: string | null | undefined,
): Promise<boolean> {
  if (isEmergency) return true;
  const perm = await resolvePermission(userId, "live_account");
  if (!perm.points.has("account_edit")) return false;

  // 新建账号：只校验 account_edit（还不存在的账号没 scope 可比）
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

  // 权限：新建查 account_edit；更新查 account_edit + 目标账号在 scope 内
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

export type SimpleResult = { ok: true } | { ok: false; error: string };

/**
 * 直播账号不提供删除（2026-10-08 下线）：删除曾连带物理删除剪辑任务 / 开播记录 / 排班，
 * 现在只能「标记废弃」——列表折叠归档、可恢复，所有历史数据保留。
 * 权限：live_account.delete_request（废弃 / 恢复账号）+ 账号在 scope 内。
 *
 * 业务错误用 `return { ok: false, error }` 而非 throw —— Next.js production 会吞掉 throw 的 message。
 */
async function resolveDeprecateCaller(
  accountId: string,
): Promise<
  | { ok: true; userId: string; account: typeof live_account.$inferSelect }
  | { ok: false; error: string }
> {
  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind !== "ok") return { ok: false, error: "未登录或未同步钉钉身份" };
  const userId = ctx.dingtalkUserId;
  if (!ctx.isEmergency) {
    const perm = await resolvePermission(userId, "live_account");
    if (!perm.points.has("delete_request")) return { ok: false, error: "无废弃账号权限" };
  }
  const [account] = await db.select().from(live_account).where(eq(live_account.id, accountId));
  if (!account) return { ok: false, error: "直播账号不存在" };
  const canWrite = await canWriteAccount(
    userId,
    ctx.isEmergency,
    account.agent_dingtalk_user_id ?? null,
  );
  if (!canWrite) return { ok: false, error: "无权操作该直播账号" };
  return { ok: true, userId, account };
}

/** 标记账号为已废弃（可恢复，历史数据不动）。 */
export async function deprecateAccount(input: unknown): Promise<SimpleResult> {
  const { id, reason } = DeprecateAccountInput.parse(input);
  const caller = await resolveDeprecateCaller(id);
  if (!caller.ok) return caller;
  if (caller.account.deprecated_at) return { ok: false, error: "该账号已是废弃状态" };

  // 正在开播的账号不能废弃（废弃后扫码页不再提供操作，进行中场次会收不了尾）
  const [live] = await db
    .select({ id: live_session_log.id })
    .from(live_session_log)
    .where(
      and(eq(live_session_log.live_account_id, id), eq(live_session_log.status, "in_progress")),
    )
    .limit(1);
  if (live) return { ok: false, error: "该账号正在开播，请先下播再废弃" };

  const now = new Date();
  const [updated] = await db
    .update(live_account)
    .set({ deprecated_at: now, deprecated_by_user_id: caller.userId, updated_at: now })
    .where(and(eq(live_account.id, id), isNull(live_account.deprecated_at)))
    .returning();
  if (!updated) return { ok: false, error: "该账号已是废弃状态" };

  await writeAuditLog({
    user_id: caller.userId,
    action: "LIVE_ACCOUNT_DEPRECATED",
    target_type: "live_account",
    target_id: id,
    before: { deprecated_at: null },
    after: { deprecated_at: now.toISOString(), reason: reason?.trim() || null },
  });
  return { ok: true };
}

/** 恢复已废弃的账号。 */
export async function restoreAccount(input: unknown): Promise<SimpleResult> {
  const { id } = RestoreAccountInput.parse(input);
  const caller = await resolveDeprecateCaller(id);
  if (!caller.ok) return caller;
  if (!caller.account.deprecated_at) return { ok: false, error: "该账号未废弃" };

  const [updated] = await db
    .update(live_account)
    .set({ deprecated_at: null, deprecated_by_user_id: null, updated_at: new Date() })
    .where(and(eq(live_account.id, id), isNotNull(live_account.deprecated_at)))
    .returning();
  if (!updated) return { ok: false, error: "该账号未废弃" };

  await writeAuditLog({
    user_id: caller.userId,
    action: "LIVE_ACCOUNT_RESTORED",
    target_type: "live_account",
    target_id: id,
    before: { deprecated_at: caller.account.deprecated_at.toISOString() },
    after: { deprecated_at: null },
  });
  return { ok: true };
}
