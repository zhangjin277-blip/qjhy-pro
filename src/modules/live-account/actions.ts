"use server";
import { db } from "@/db/client";
import { dingtalk_user, live_account, placement_row } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { getManagedDeptIds, resolvePermission } from "@/modules/permissions/server";
import { AppError } from "@/lib/errors";
import { count, eq, sql } from "drizzle-orm";
import type { DeleteImpact } from "@/db/schema";
import {
  UpsertAccountInput,
  DeleteAccountInput,
  DeleteContextInput,
  DeleteRequestCreateInput,
  DeleteRequestReviewInput,
  DeleteRequestCancelInput,
} from "./schema";
import {
  cancelDeleteRequest,
  countDeleteImpact,
  createDeleteRequest,
  deleteAccountCascade,
  findPendingRequest,
  reviewDeleteRequest,
} from "./delete-request";
import { notifyDeleteRequested, notifyDeleteReviewed } from "./notify";

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

/**
 * 删除直播账号。
 *
 * 业务错误用 `return { ok: false, error }` 而非 throw —
 * Next.js production 会把 server-side throw 包装成 generic "Server Components
 * render" 错误并吞掉具体 message，导致前端无法显示业务原因。
 *
 * 有 placement_row 关联时默认拒绝；force=true 时连同 placement_row 一起删
 * （admin 显式二次确认后）。
 */
export type DeleteAccountResult =
  | { ok: true; deletedPlacementCount: number }
  | {
      ok: false;
      error: string;
      placementCount?: number;
      canForce?: boolean;
      /** true = 调用者只有编辑权限，应走删除申请流程 */
      needRequest?: boolean;
    };

export async function deleteAccount(input: unknown): Promise<DeleteAccountResult> {
  const { id, force } = DeleteAccountInput.parse(input);
  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind !== "ok") return { ok: false, error: "未登录或未同步钉钉身份" };
  const userId = ctx.dingtalkUserId;

  // 2026-07-14 事故后：直删仅限 live_account 管理员；编辑权限走申请-审核流
  let isAdmin = ctx.isEmergency;
  if (!isAdmin) {
    const perm = await resolvePermission(userId, "live_account");
    if (!perm.points.has("delete_request")) return { ok: false, error: "无删除申请权限" };
    isAdmin = perm.points.has("delete_review");
  }
  if (!isAdmin) {
    return {
      ok: false,
      error: "删除直播账号需管理员审核，请提交删除申请",
      needRequest: true,
    };
  }

  const [before] = await db.select().from(live_account).where(eq(live_account.id, id));
  if (!before) return { ok: false, error: "直播账号不存在" };

  const [placementCount] = await db
    .select({ n: count() })
    .from(placement_row)
    .where(eq(placement_row.live_account_id, id));
  const pCount = placementCount?.n ?? 0;

  if (pCount > 0 && !force) {
    return {
      ok: false,
      error: `该账号有 ${pCount} 条投放历史数据。点「强制删除」可一并删除（不可恢复）。`,
      placementCount: pCount,
      canForce: true,
    };
  }

  await db.transaction(async (tx) => deleteAccountCascade(tx, id));

  await writeAuditLog({
    user_id: userId,
    action: force ? "LIVE_ACCOUNT_FORCE_DELETED" : "LIVE_ACCOUNT_DELETED",
    target_type: "live_account",
    target_id: id,
    before,
    after: { placement_rows_deleted: pCount, force: !!force },
  });

  return { ok: true, deletedPlacementCount: pCount };
}

// ─── 删除审核流 ──────────────────────────────────────────────────────────────

export type DeleteContextResult =
  | {
      ok: true;
      mode: "direct" | "request";
      impact: DeleteImpact;
      pending: {
        id: string;
        requestedByName: string;
        requestedAt: string;
        canCancel: boolean;
      } | null;
    }
  | { ok: false; error: string };

/** 点「删除」时先取上下文：当前用户走直删还是申请、连带数据量、是否已有待审申请。 */
export async function getAccountDeleteContext(input: unknown): Promise<DeleteContextResult> {
  const { id } = DeleteContextInput.parse(input);
  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind !== "ok") return { ok: false, error: "未登录或未同步钉钉身份" };
  const userId = ctx.dingtalkUserId;

  let isAdmin = ctx.isEmergency;
  if (!isAdmin) {
    const perm = await resolvePermission(userId, "live_account");
    if (!perm.points.has("delete_request")) return { ok: false, error: "无删除申请权限" };
    isAdmin = perm.points.has("delete_review");
  }

  const [account] = await db.select().from(live_account).where(eq(live_account.id, id));
  if (!account) return { ok: false, error: "直播账号不存在" };

  const [impact, pending] = await Promise.all([countDeleteImpact(id), findPendingRequest(id)]);

  let pendingView: Extract<DeleteContextResult, { ok: true }>["pending"] = null;
  if (pending) {
    const [requester] = await db
      .select({ name: dingtalk_user.name })
      .from(dingtalk_user)
      .where(eq(dingtalk_user.user_id, pending.requested_by_user_id));
    pendingView = {
      id: pending.id,
      requestedByName: requester?.name ?? pending.requested_by_user_id,
      requestedAt: pending.requested_at.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
      canCancel: isAdmin || pending.requested_by_user_id === userId,
    };
  }

  return { ok: true, mode: isAdmin ? "direct" : "request", impact, pending: pendingView };
}

export type SimpleResult = { ok: true } | { ok: false; error: string };

/** 提交删除申请（编辑权限 + 账号在 scope 内）。 */
export async function requestAccountDeletion(input: unknown): Promise<SimpleResult> {
  const { id, reason } = DeleteRequestCreateInput.parse(input);
  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind !== "ok") return { ok: false, error: "未登录或未同步钉钉身份" };
  if (ctx.isEmergency) return { ok: false, error: "管理员可直接删除，无需提交申请" };
  const userId = ctx.dingtalkUserId;

  const [account] = await db.select().from(live_account).where(eq(live_account.id, id));
  if (!account) return { ok: false, error: "直播账号不存在" };
  const canWrite = await canWriteAccount(userId, false, account.agent_dingtalk_user_id ?? null);
  if (!canWrite) return { ok: false, error: "无权操作该直播账号" };

  try {
    const row = await createDeleteRequest({
      accountId: id,
      reason: reason ?? null,
      requestedBy: userId,
    });

    await writeAuditLog({
      user_id: userId,
      action: "LIVE_ACCOUNT_DELETE_REQUESTED",
      target_type: "live_account_delete_request",
      target_id: row.id,
      before: null,
      after: row,
    });

    const [requester] = await db
      .select({ name: dingtalk_user.name })
      .from(dingtalk_user)
      .where(eq(dingtalk_user.user_id, userId));
    void notifyDeleteRequested({
      accountName: row.account_name,
      product: row.product,
      requesterName: requester?.name ?? userId,
      reason: row.reason,
      impact: row.impact,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof AppError ? e.message : "提交删除申请失败" };
  }
}

/** 审批删除申请（live_account 管理员）。批准即执行删除。 */
export async function reviewAccountDeletion(input: unknown): Promise<SimpleResult> {
  const { requestId, approve, note } = DeleteRequestReviewInput.parse(input);
  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind !== "ok") return { ok: false, error: "未登录或未同步钉钉身份" };
  const userId = ctx.dingtalkUserId;

  let isAdmin = ctx.isEmergency;
  if (!isAdmin) {
    const perm = await resolvePermission(userId, "live_account");
    isAdmin = perm.points.has("delete_review");
  }
  if (!isAdmin) return { ok: false, error: "需要删除审批权限" };

  try {
    const res = await reviewDeleteRequest({
      requestId,
      approve,
      note: note ?? null,
      reviewedBy: ctx.isEmergency ? null : userId,
    });

    await writeAuditLog({
      user_id: userId,
      action: approve ? "LIVE_ACCOUNT_DELETE_APPROVED" : "LIVE_ACCOUNT_DELETE_REJECTED",
      target_type: "live_account_delete_request",
      target_id: requestId,
      before: res.request.account_snapshot as Record<string, unknown>,
      after: { executed: res.executed, accountMissing: res.accountMissing, note: note ?? null },
    });

    if (!res.accountMissing) {
      const reviewerName = ctx.isEmergency
        ? "应急管理员"
        : ((
            await db
              .select({ name: dingtalk_user.name })
              .from(dingtalk_user)
              .where(eq(dingtalk_user.user_id, userId))
          )[0]?.name ?? userId);
      void notifyDeleteReviewed({
        accountName: res.request.account_name,
        approved: approve,
        reviewerName,
        note: note ?? null,
        requestedByUserId: res.request.requested_by_user_id,
      });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof AppError ? e.message : "审批失败" };
  }
}

/** 撤销待审申请（申请人本人或管理员）。 */
export async function cancelAccountDeleteRequest(input: unknown): Promise<SimpleResult> {
  const { requestId } = DeleteRequestCancelInput.parse(input);
  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind !== "ok") return { ok: false, error: "未登录或未同步钉钉身份" };
  const userId = ctx.dingtalkUserId;

  let isAdmin = ctx.isEmergency;
  if (!isAdmin) {
    const perm = await resolvePermission(userId, "live_account");
    if (!perm.points.has("delete_request")) return { ok: false, error: "无删除申请权限" };
    isAdmin = perm.points.has("delete_review");
  }

  try {
    const row = await cancelDeleteRequest({
      requestId,
      userId: ctx.isEmergency ? null : userId,
      isAdmin,
    });
    await writeAuditLog({
      user_id: userId,
      action: "LIVE_ACCOUNT_DELETE_CANCELLED",
      target_type: "live_account_delete_request",
      target_id: requestId,
      before: null,
      after: { account_id: row.account_id, account_name: row.account_name },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof AppError ? e.message : "撤销失败" };
  }
}
