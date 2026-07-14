import "server-only";
import { db } from "@/db/client";
import {
  account_anchor_default,
  daily_schedule_day,
  daily_schedule_segment,
  dingtalk_user,
  editing_task,
  live_account,
  live_account_delete_request,
  live_session_log,
  placement_cumulative_raw,
  placement_row,
  schedule_override,
  type DeleteImpact,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import { and, count, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

type DbClient = typeof db;
type TxClient = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

/**
 * 删除账号的连带清理（FK 引用清单，新增 FK 表时必须同步补这里）：
 *   placement_row / placement_cumulative_raw（投放）
 *   schedule_override / daily_schedule_segment / daily_schedule_day（排班）
 *   account_anchor_default（主播绑定）
 *   live_session_log（开播记录）
 *   editing_task（剪辑任务；editing_task_event 有 onDelete cascade 自动带走）
 */
export async function deleteAccountCascade(dbc: DbClient | TxClient, id: string): Promise<void> {
  await dbc.delete(placement_row).where(eq(placement_row.live_account_id, id));
  await dbc
    .delete(placement_cumulative_raw)
    .where(eq(placement_cumulative_raw.live_account_id, id));
  await dbc.delete(schedule_override).where(eq(schedule_override.account_id, id));
  await dbc.delete(daily_schedule_segment).where(eq(daily_schedule_segment.account_id, id));
  await dbc.delete(daily_schedule_day).where(eq(daily_schedule_day.account_id, id));
  await dbc.delete(account_anchor_default).where(eq(account_anchor_default.account_id, id));
  await dbc.delete(live_session_log).where(eq(live_session_log.live_account_id, id));
  await dbc.delete(editing_task).where(eq(editing_task.live_account_id, id));
  await dbc.delete(live_account).where(eq(live_account.id, id));
}

/** 统计删除该账号会连带删掉的数据量（申请与审批时展示）。 */
export async function countDeleteImpact(accountId: string): Promise<DeleteImpact> {
  const one = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const [tasks, sessions, placements, overrides, days, segments, bindings] = await Promise.all([
    one(
      db
        .select({ n: count() })
        .from(editing_task)
        .where(eq(editing_task.live_account_id, accountId)),
    ),
    one(
      db
        .select({ n: count() })
        .from(live_session_log)
        .where(eq(live_session_log.live_account_id, accountId)),
    ),
    one(
      db
        .select({ n: count() })
        .from(placement_row)
        .where(eq(placement_row.live_account_id, accountId)),
    ),
    one(
      db
        .select({ n: count() })
        .from(schedule_override)
        .where(eq(schedule_override.account_id, accountId)),
    ),
    one(
      db
        .select({ n: count() })
        .from(daily_schedule_day)
        .where(eq(daily_schedule_day.account_id, accountId)),
    ),
    one(
      db
        .select({ n: count() })
        .from(daily_schedule_segment)
        .where(eq(daily_schedule_segment.account_id, accountId)),
    ),
    one(
      db
        .select({ n: count() })
        .from(account_anchor_default)
        .where(eq(account_anchor_default.account_id, accountId)),
    ),
  ]);
  return {
    editing_tasks: tasks,
    live_sessions: sessions,
    placement_rows: placements,
    schedule_items: overrides + days + segments,
    anchor_bindings: bindings,
  };
}

export type DeleteRequestRow = typeof live_account_delete_request.$inferSelect;

/** 某账号当前的待审申请（无则 null）。 */
export async function findPendingRequest(accountId: string): Promise<DeleteRequestRow | null> {
  const [row] = await db
    .select()
    .from(live_account_delete_request)
    .where(
      and(
        eq(live_account_delete_request.account_id, accountId),
        eq(live_account_delete_request.status, "pending"),
      ),
    );
  return row ?? null;
}

/** 创建删除申请。调用方已校验权限。 */
export async function createDeleteRequest(args: {
  accountId: string;
  reason: string | null;
  requestedBy: string;
}): Promise<DeleteRequestRow> {
  const [account] = await db.select().from(live_account).where(eq(live_account.id, args.accountId));
  if (!account) throw new AppError("LIVE_ACCOUNT_NOT_FOUND", "直播账号不存在", 404);

  const pending = await findPendingRequest(args.accountId);
  if (pending) {
    throw new AppError("DELETE_REQUEST_EXISTS", "该账号已有待审核的删除申请", 409);
  }

  const impact = await countDeleteImpact(args.accountId);
  const [row] = await db
    .insert(live_account_delete_request)
    .values({
      id: crypto.randomUUID(),
      account_id: args.accountId,
      account_name: account.account_name,
      product: account.product,
      account_snapshot: account,
      impact,
      reason: args.reason,
      requested_by_user_id: args.requestedBy,
    })
    .returning();
  if (!row) throw new AppError("DELETE_REQUEST_FAILED", "创建删除申请失败", 500);
  return row;
}

export interface ReviewResult {
  request: DeleteRequestRow;
  /** 批准且真正执行了删除 */
  executed: boolean;
  /** 批准时发现账号已不存在（被管理员直删过），申请转 cancelled */
  accountMissing: boolean;
}

/**
 * 审批删除申请。approve=true 时在同一事务里执行账号删除。
 * 用「UPDATE ... WHERE status='pending'」做乐观锁，防止并发重复审批。
 */
export async function reviewDeleteRequest(args: {
  requestId: string;
  approve: boolean;
  note: string | null;
  /** null = 应急后门（不在 dingtalk_user 表，FK 存不了） */
  reviewedBy: string | null;
}): Promise<ReviewResult> {
  return db.transaction(async (tx) => {
    const targetStatus = args.approve ? "approved" : "rejected";
    const [claimed] = await tx
      .update(live_account_delete_request)
      .set({
        status: targetStatus,
        review_note: args.note,
        reviewed_by_user_id: args.reviewedBy,
        reviewed_at: new Date(),
      })
      .where(
        and(
          eq(live_account_delete_request.id, args.requestId),
          eq(live_account_delete_request.status, "pending"),
        ),
      )
      .returning();
    if (!claimed) {
      throw new AppError("DELETE_REQUEST_NOT_PENDING", "申请不存在或已被处理", 409);
    }
    if (!args.approve) return { request: claimed, executed: false, accountMissing: false };

    const [account] = await tx
      .select()
      .from(live_account)
      .where(eq(live_account.id, claimed.account_id));
    if (!account) {
      const [cancelled] = await tx
        .update(live_account_delete_request)
        .set({ status: "cancelled", review_note: "账号已不存在（可能已被管理员直接删除）" })
        .where(eq(live_account_delete_request.id, claimed.id))
        .returning();
      return { request: cancelled ?? claimed, executed: false, accountMissing: true };
    }

    await deleteAccountCascade(tx, claimed.account_id);
    return { request: claimed, executed: true, accountMissing: false };
  });
}

/** 撤销自己的待审申请（管理员可撤任何人的）。 */
export async function cancelDeleteRequest(args: {
  requestId: string;
  /** null = 应急后门 */
  userId: string | null;
  isAdmin: boolean;
}): Promise<DeleteRequestRow> {
  const [row] = await db
    .select()
    .from(live_account_delete_request)
    .where(eq(live_account_delete_request.id, args.requestId));
  if (!row) throw new AppError("DELETE_REQUEST_NOT_FOUND", "删除申请不存在", 404);
  if (row.status !== "pending") {
    throw new AppError("DELETE_REQUEST_NOT_PENDING", "申请已被处理，无法撤销", 409);
  }
  if (!args.isAdmin && row.requested_by_user_id !== args.userId) {
    throw new AppError("AUTH_FORBIDDEN", "只能撤销自己提交的申请", 403);
  }
  const [updated] = await db
    .update(live_account_delete_request)
    .set({ status: "cancelled", reviewed_by_user_id: args.userId, reviewed_at: new Date() })
    .where(
      and(
        eq(live_account_delete_request.id, args.requestId),
        eq(live_account_delete_request.status, "pending"),
      ),
    )
    .returning();
  if (!updated) throw new AppError("DELETE_REQUEST_NOT_PENDING", "申请已被处理，无法撤销", 409);
  return updated;
}

export interface PendingDeleteRequestView {
  id: string;
  account_id: string;
  account_name: string;
  product: string;
  reason: string | null;
  impact: DeleteImpact;
  requested_by_name: string | null;
  requested_at: Date;
}

/** 待审申请列表（审批横幅用），带申请人姓名。 */
export async function listPendingDeleteRequests(): Promise<PendingDeleteRequestView[]> {
  const requester = alias(dingtalk_user, "requester");
  const rows = await db
    .select({
      id: live_account_delete_request.id,
      account_id: live_account_delete_request.account_id,
      account_name: live_account_delete_request.account_name,
      product: live_account_delete_request.product,
      reason: live_account_delete_request.reason,
      impact: live_account_delete_request.impact,
      requested_by_name: requester.name,
      requested_at: live_account_delete_request.requested_at,
    })
    .from(live_account_delete_request)
    .leftJoin(requester, eq(requester.user_id, live_account_delete_request.requested_by_user_id))
    .where(eq(live_account_delete_request.status, "pending"))
    .orderBy(desc(live_account_delete_request.requested_at));
  return rows;
}
