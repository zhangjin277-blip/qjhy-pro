import "server-only";
import { resolveProcurementAnchor } from "./anchor-options";
import { businessDate } from "@/lib/business-date";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { procurement_item, procurement_log, type ProcurementStatus } from "@/db/schema";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { AppError } from "@/lib/errors";
import { hasPoint, resolvePermission, scopeAtLeast } from "@/modules/permissions/server";
import { notifyProcurementNew, notifyProcurementTransition } from "./notify";

export async function requireProcurementAccess(point?: string) {
  const identity = await getCurrentDingtalkUser();
  if (identity.kind !== "ok") throw new AppError("AUTH_NOT_LOGGED_IN", "未登录", 401);
  const permission = identity.isEmergency
    ? { scope: "all" as const, points: new Set(["create", "approve", "manage", "export"]) }
    : await resolvePermission(identity.dingtalkUserId, "procurement");
  if (permission.scope === "none" || (point && !hasPoint(permission, point)))
    throw new AppError("FORBIDDEN", "没有采购模块权限", 403);
  return { userId: identity.dingtalkUserId, permission };
}

export async function listProcurement(input: { status?: string; search?: string } = {}) {
  const { userId, permission } = await requireProcurementAccess();
  const filters = [];
  if (input.status && input.status !== "all")
    filters.push(eq(procurement_item.status, input.status as ProcurementStatus));
  if (input.search) filters.push(ilike(procurement_item.item_name, `%${input.search}%`));
  if (!scopeAtLeast(permission.scope, "team"))
    filters.push(eq(procurement_item.submitter_user_id, userId));
  return db
    .select()
    .from(procurement_item)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(procurement_item.created_at));
}

export async function procurementStats() {
  await requireProcurementAccess();
  const rows = await db
    .select({
      status: procurement_item.status,
      count: sql<number>`count(*)::int`,
      spend: sql<string>`coalesce(sum(coalesce(${procurement_item.actual_price}, ${procurement_item.price} * ${procurement_item.quantity})),0) - coalesce(sum(${procurement_item.refund_amount}),0)`,
    })
    .from(procurement_item)
    .groupBy(procurement_item.status);
  const result: Record<string, unknown> = Object.fromEntries(
    rows.map((r) => [r.status, { count: r.count, spend: Number(r.spend) }]),
  );
  result.total = rows.reduce((n, r) => n + Number(r.count), 0);
  result.totalSpend = rows.reduce((n, r) => n + Number(r.spend), 0);
  return result;
}

export async function createProcurement(input: Record<string, unknown>) {
  const { userId } = await requireProcurementAccess("create");
  if (!String(input.item_name ?? "").trim())
    throw new AppError("VALIDATION_ERROR", "请填写物品名称", 400);
  const selectedAnchor = await resolveProcurementAnchor(input.anchor_binding_id);
  const [row] = await db
    .insert(procurement_item)
    .values({
      item_name: String(input.item_name),
      price: String(input.price ?? 0),
      quantity: Number(input.quantity ?? 1),
      platform: String(input.platform ?? ""),
      link: String(input.link ?? ""),
      screenshot: input.screenshots
        ? JSON.stringify(input.screenshots)
        : String(input.screenshot ?? ""),
      requester: String(input.requester ?? ""),
      ...selectedAnchor,
      usage: String(input.usage ?? ""),
      remarks: String(input.remarks ?? ""),
      invoice: String(input.invoice ?? "可开票"),
      status: "pending_approval",
      submitter_user_id: userId,
      submitter: String(input.submitter ?? ""),
      submission_date: businessDate(),
    })
    .returning();
  if (!row) throw new AppError("PROCUREMENT_CREATE_FAILED", "采购申请创建失败", 500);
  await db.insert(procurement_log).values({
    item_id: row.id,
    action: "提交采购申请",
    to_status: "pending_approval",
    operator_user_id: userId,
  });
  void notifyProcurementNew(row, row.submitter || "未知申请人");
  return row;
}

export async function updateProcurement(id: number, input: Record<string, unknown>) {
  const { userId } = await requireProcurementAccess("manage");
  const selectedAnchor = input.anchor_binding_id
    ? await resolveProcurementAnchor(input.anchor_binding_id)
    : {};
  const [row] = await db
    .update(procurement_item)
    .set({
      item_name: input.item_name == null ? undefined : String(input.item_name),
      price: input.price == null ? undefined : String(input.price),
      quantity: input.quantity == null ? undefined : Number(input.quantity),
      platform: input.platform == null ? undefined : String(input.platform),
      link: input.link == null ? undefined : String(input.link),
      screenshot: input.screenshots == null ? undefined : JSON.stringify(input.screenshots),
      requester: input.requester == null ? undefined : String(input.requester),
      ...selectedAnchor,
      usage: input.usage == null ? undefined : String(input.usage),
      invoice: input.invoice == null ? undefined : String(input.invoice),
      remarks: input.remarks == null ? undefined : String(input.remarks),
      updated_at: new Date(),
    })
    .where(eq(procurement_item.id, id))
    .returning();
  if (!row) throw new AppError("NOT_FOUND", "采购记录不存在", 404);
  await db.insert(procurement_log).values({
    item_id: id,
    action: "编辑采购申请",
    operator_user_id: userId,
    remark: "更新申请信息",
  });
  return row;
}

export async function deleteProcurement(id: number) {
  const { userId } = await requireProcurementAccess("manage");
  const [row] = await db.delete(procurement_item).where(eq(procurement_item.id, id)).returning();
  if (!row) throw new AppError("NOT_FOUND", "采购记录不存在", 404);
  return { id: row.id, deletedBy: userId };
}

export async function transitionProcurement(
  id: number,
  action: "approve" | "reject" | "purchase" | "ship" | "receive" | "return",
  input: Record<string, unknown> = {},
) {
  const { userId, permission } = await requireProcurementAccess(
    action === "approve" || action === "reject" ? "approve" : "manage",
  );
  if (action === "approve" || action === "reject") {
    const remark = String(input.remark ?? "").trim();
    if (action === "reject" && !remark)
      throw new AppError("VALIDATION_ERROR", "请填写驳回原因", 400);
    const visible = and(
      eq(procurement_item.id, id),
      scopeAtLeast(permission.scope, "team")
        ? undefined
        : eq(procurement_item.submitter_user_id, userId),
    );
    const row = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(procurement_item).where(visible);
      if (!current) throw new AppError("NOT_FOUND", "采购记录不存在或无权处理", 404);
      if (current.status !== "pending_approval")
        throw new AppError("CONFLICT", "该申请已处理，请刷新后查看", 409);
      const next = action === "approve" ? "pending" : "rejected";
      const [updated] = await tx
        .update(procurement_item)
        .set({
          status: next,
          approver_user_id: userId,
          approval_remark: remark,
          approval_date: businessDate(),
          updated_at: new Date(),
        })
        .where(and(visible, eq(procurement_item.status, "pending_approval")))
        .returning();
      if (!updated) throw new AppError("CONFLICT", "该申请已被其他人处理，请刷新", 409);
      await tx.insert(procurement_log).values({
        item_id: id,
        action,
        from_status: "pending_approval",
        to_status: next,
        operator_user_id: userId,
        remark,
      });
      return updated;
    });
    void notifyProcurementTransition(
      action === "approve" ? "审批通过" : "审批拒绝",
      row,
      userId,
      remark ? `\n> 意见：${remark}` : "",
    );
    return row;
  }
  const [current] = await db.select().from(procurement_item).where(eq(procurement_item.id, id));
  if (!current) throw new AppError("NOT_FOUND", "采购记录不存在", 404);
  const map = {
    approve: "pending",
    reject: "rejected",
    purchase: "purchased",
    ship: "shipped",
    receive: "received",
    return: "returned",
  } as const;
  const next =
    action === "purchase" && current.status !== "pending"
      ? current.status
      : action === "ship" && ["shipped", "received", "returned"].includes(current.status)
        ? current.status
        : map[action];
  if (!next) throw new AppError("VALIDATION_ERROR", "不支持的采购操作", 400);
  const patch: Partial<typeof procurement_item.$inferInsert> = {
    status: next,
    updated_at: new Date(),
  };
  if (action === "purchase") {
    if (input.order_id !== undefined) patch.order_id = String(input.order_id ?? "");
    if (input.shop_name !== undefined) patch.shop_name = String(input.shop_name ?? "");
    if (input.actual_price !== undefined)
      patch.actual_price =
        input.actual_price == null || input.actual_price === "" ? null : String(input.actual_price);
    patch.purchase_date = current.purchase_date ?? businessDate();
  }
  if (action === "ship" && input.tracking_no !== undefined)
    patch.tracking_no = String(input.tracking_no ?? "");
  if (action === "receive") patch.received_date = businessDate();
  if (action === "return") {
    patch.return_reason = String(input.reason ?? "");
    patch.refund_amount = String(input.refund_amount ?? 0);
    patch.return_date = businessDate();
  }
  const [row] = await db
    .update(procurement_item)
    .set(patch)
    .where(eq(procurement_item.id, id))
    .returning();
  await db.insert(procurement_log).values({
    item_id: id,
    action,
    from_status: current.status,
    to_status: next,
    operator_user_id: userId,
    remark: String(input.remark ?? input.reason ?? ""),
  });
  const operator = current.approver_name || userId;
  const title =
    action === "purchase"
      ? "已购买"
      : action === "ship"
        ? "已发货"
        : action === "receive"
          ? "已入库"
          : "已退货";
  const details =
    action === "purchase"
      ? `\n> 实付：¥${input.actual_price ?? "-"}\n> 订单号：${input.order_id || "-"}`
      : action === "ship"
        ? `\n> 快递单号：${input.tracking_no || "-"}`
        : action === "return"
          ? `\n> 退款金额：¥${input.refund_amount ?? 0}`
          : "";
  void notifyProcurementTransition(title, row ?? current, operator, details);
  return row;
}

export async function listProcurementLogs(id: number) {
  await requireProcurementAccess();
  return db
    .select()
    .from(procurement_log)
    .where(eq(procurement_log.item_id, id))
    .orderBy(desc(procurement_log.created_at));
}
