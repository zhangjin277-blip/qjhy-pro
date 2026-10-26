"use server";
import { db } from "@/db/client";
import { account_anchor_default, live_account, live_anchor, dingtalk_user } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import {
  markDirtyByAccountDateRange,
  runAttributionJob,
} from "@/modules/placement-attribution/server";
import { AppError } from "@/lib/errors";
import { eq, and, isNull, or, sql } from "drizzle-orm";
import { UpsertBindingInput, DeleteBindingInput, ListBindingsInput } from "./schema";

/**
 * 默认排班变更影响投放归因：把 effective 区间内已入库的 placement_row 标脏，
 * 并异步触发归因 job（job 内部分批循环；失败有 04:00 cron 兜底）。
 */
async function remarkAttributionForWindows(
  windows: { account_id: string; effective_from: string; effective_to: string | null }[],
) {
  for (const w of windows) {
    await markDirtyByAccountDateRange(w.account_id, w.effective_from, w.effective_to);
  }
  runAttributionJob().catch((err: unknown) => {
    console.error("[account-bindings] attribution job failed:", err);
  });
}

async function requireBindingEdit(): Promise<{ userId: string }> {
  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind === "unauth") throw new AppError("AUTH_NOT_LOGGED_IN", "未登录", 401);
  if (ctx.kind === "user_not_synced")
    throw new AppError("AUTH_USER_NOT_SYNCED", "钉钉账号未同步", 403);
  if (ctx.isEmergency) return { userId: ctx.dingtalkUserId };
  const perm = await resolvePermission(ctx.dingtalkUserId, "live_anchor");
  if (!perm.points.has("binding_edit")) throw new AppError("AUTH_FORBIDDEN", "无账号绑定权限", 403);
  return { userId: ctx.dingtalkUserId };
}

export async function listBindings(input: unknown) {
  const data = ListBindingsInput.parse(input);
  const conditions = [];
  if (data.account_id) conditions.push(eq(account_anchor_default.account_id, data.account_id));
  if (data.dingtalk_user_id) {
    conditions.push(eq(account_anchor_default.dingtalk_user_id, data.dingtalk_user_id));
  }

  const rows = await db
    .select({
      id: account_anchor_default.id,
      account_id: account_anchor_default.account_id,
      account_name: live_account.account_name,
      platform: live_account.platform,
      account_deprecated_at: live_account.deprecated_at,
      dingtalk_user_id: account_anchor_default.dingtalk_user_id,
      anchor_name: dingtalk_user.name,
      time_slots: account_anchor_default.time_slots,
      rest_days: account_anchor_default.rest_days,
      remark: account_anchor_default.remark,
      effective_from: account_anchor_default.effective_from,
      effective_to: account_anchor_default.effective_to,
    })
    .from(account_anchor_default)
    .leftJoin(live_account, eq(account_anchor_default.account_id, live_account.id))
    .leftJoin(dingtalk_user, eq(account_anchor_default.dingtalk_user_id, dingtalk_user.user_id))
    .where(conditions.length > 0 ? and(...conditions) : sql`true`)
    .orderBy(account_anchor_default.effective_from);

  return rows;
}

/**
 * 业务错误用 `return { ok: false, error }` 而非 throw —
 * Next.js production 会把 server-side throw 包装成 generic "Server Components
 * render" 错误并吞掉具体 message，导致前端无法显示业务原因。
 */
export type BindingResult =
  | { ok: true; binding: typeof account_anchor_default.$inferSelect | undefined }
  | { ok: false; error: string };

export async function upsertBinding(input: unknown): Promise<BindingResult> {
  const parsed = UpsertBindingInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: `参数校验失败：${parsed.error.issues[0]?.message ?? "未知"}` };
  }
  const data = parsed.data;
  let userId: string;
  try {
    ({ userId } = await requireBindingEdit());
  } catch (e) {
    return { ok: false, error: e instanceof AppError ? e.message : "无排班编辑权限" };
  }

  const id = data.id ?? crypto.randomUUID();
  const isUpdate = Boolean(data.id);

  const [beforeRow] = isUpdate
    ? await db.select().from(account_anchor_default).where(eq(account_anchor_default.id, id))
    : [null];
  if (isUpdate && !beforeRow) {
    return { ok: false, error: "排班绑定不存在" };
  }

  // account_anchor_default.dingtalk_user_id FK → live_anchor（不是 dingtalk_user）。
  // 下拉允许选「钉钉主播部门里还没建档的人」，所以这里自动补建主播档案：
  // business_line 用该账号的 product，employment_type 默认「正式」，后续可在主播管理改。
  const [anchorProfile] = await db
    .select({ dingtalk_user_id: live_anchor.dingtalk_user_id })
    .from(live_anchor)
    .where(eq(live_anchor.dingtalk_user_id, data.dingtalk_user_id));
  if (!anchorProfile) {
    const [account] = await db
      .select({ product: live_account.product })
      .from(live_account)
      .where(eq(live_account.id, data.account_id));
    if (!account) return { ok: false, error: "直播账号不存在" };
    try {
      await db.insert(live_anchor).values({
        dingtalk_user_id: data.dingtalk_user_id,
        business_line: account.product,
        employment_type: "正式",
        work_status: "active",
      });
    } catch (e) {
      console.error("[upsertBinding] auto-create live_anchor failed:", e);
      return {
        ok: false,
        error: `该主播还没有档案且自动建档失败：${e instanceof Error ? e.message : "未知错误"}`,
      };
    }
  }

  const values = {
    id,
    account_id: data.account_id,
    dingtalk_user_id: data.dingtalk_user_id,
    time_slots: data.time_slots,
    rest_days: data.rest_days,
    remark: data.remark ?? null,
    ...(data.effective_from ? { effective_from: data.effective_from } : {}),
    effective_to: data.effective_to ?? null,
    updated_at: new Date(),
  };

  let result;
  try {
    if (isUpdate) {
      [result] = await db
        .update(account_anchor_default)
        .set(values)
        .where(eq(account_anchor_default.id, id))
        .returning();
    } else {
      [result] = await db.insert(account_anchor_default).values(values).returning();
    }
  } catch (e) {
    console.error("[upsertBinding] db error:", e);
    return { ok: false, error: `保存失败：${e instanceof Error ? e.message : "数据库错误"}` };
  }

  await writeAuditLog({
    user_id: userId,
    action: isUpdate ? "BINDING_UPDATED" : "BINDING_CREATED",
    target_type: "account_anchor_default",
    target_id: id,
    before: beforeRow,
    after: result,
  });

  // 新旧 effective 区间都要重算：编辑可能改了 account / 时段 / 生效窗
  const windows: { account_id: string; effective_from: string; effective_to: string | null }[] = [];
  if (beforeRow) {
    windows.push({
      account_id: beforeRow.account_id,
      effective_from: beforeRow.effective_from,
      effective_to: beforeRow.effective_to,
    });
  }
  if (result) {
    windows.push({
      account_id: result.account_id,
      effective_from: result.effective_from,
      effective_to: result.effective_to,
    });
  }
  await remarkAttributionForWindows(windows);

  return { ok: true, binding: result };
}

export type DeleteBindingResult = { ok: true } | { ok: false; error: string };

export async function deleteBinding(input: unknown): Promise<DeleteBindingResult> {
  const parsed = DeleteBindingInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "参数校验失败" };
  const { id } = parsed.data;
  let userId: string;
  try {
    ({ userId } = await requireBindingEdit());
  } catch (e) {
    return { ok: false, error: e instanceof AppError ? e.message : "无排班编辑权限" };
  }

  const [before] = await db
    .select()
    .from(account_anchor_default)
    .where(eq(account_anchor_default.id, id));
  if (!before) return { ok: false, error: "排班绑定不存在" };

  await db.delete(account_anchor_default).where(eq(account_anchor_default.id, id));

  await writeAuditLog({
    user_id: userId,
    action: "BINDING_DELETED",
    target_type: "account_anchor_default",
    target_id: id,
    before,
  });

  await remarkAttributionForWindows([
    {
      account_id: before.account_id,
      effective_from: before.effective_from,
      effective_to: before.effective_to,
    },
  ]);

  return { ok: true } as const;
}

/**
 * 获取某账号当日有效的所有 bindings（用于排班矩阵 + 后续归因）。
 */
export async function getActiveBindingsForAccount(account_id: string, date: string) {
  // "use server" 导出可被客户端直接 RPC 调用，至少要求已登录已同步（emergency 视为已登录）
  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind === "unauth") throw new AppError("AUTH_NOT_LOGGED_IN", "未登录", 401);
  if (ctx.kind === "user_not_synced")
    throw new AppError("AUTH_USER_NOT_SYNCED", "钉钉账号未同步", 403);
  return db
    .select()
    .from(account_anchor_default)
    .where(
      and(
        eq(account_anchor_default.account_id, account_id),
        sql`${account_anchor_default.effective_from} <= ${date}::date`,
        or(
          isNull(account_anchor_default.effective_to),
          sql`${account_anchor_default.effective_to} >= ${date}::date`,
        ),
      ),
    );
}
