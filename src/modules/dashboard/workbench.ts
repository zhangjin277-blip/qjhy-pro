import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { dingtalk_user, editing_task, live_account, procurement_item } from "@/db/schema";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { businessDate } from "@/lib/business-date";
import { AppError } from "@/lib/errors";
import { resolvePermission } from "@/modules/permissions/server";
import { requireProcurementAccess } from "@/modules/procurement/server";
import {
  buildEditingScopeWhere,
  queryStatusCounts,
  queryTodaySummary,
} from "@/modules/editing-task/server";
import { dispatchAttendanceRequest } from "@/modules/attendance/server";
import { getCoreKpis } from "./queries";
import { resolveDashboardScope } from "./scope";
import { getWorkbenchNotices } from "./notices";
import { attendanceSummarySchema, summarizeAttendance } from "./workbench-rules";
import type {
  ApprovalPreview,
  VideoPreview,
  VideoStage,
  WorkbenchData,
  WorkbenchSection,
} from "./workbench-types";

async function section<T>(label: string, load: () => Promise<T>): Promise<WorkbenchSection<T>> {
  try {
    return { data: await load(), error: null };
  } catch (error) {
    if (error instanceof AppError && error.httpStatus === 403)
      return { data: null, error: "暂无此板块权限" };
    console.error(`[workbench:${label}] failed`);
    return { data: null, error: "暂时无法加载，请刷新重试" };
  }
}

export async function getWorkbench(): Promise<WorkbenchData> {
  const identity = await getCurrentDingtalkUser();
  if (identity.kind !== "ok")
    throw new AppError(
      "AUTH_NOT_LOGGED_IN",
      "请先登录有效账号",
      identity.kind === "unauth" ? 401 : 403,
    );
  const userId = identity.dingtalkUserId;
  const today = businessDate();
  const yesterday = new Date(new Date(`${today}T00:00:00Z`).getTime() - 86400000)
    .toISOString()
    .slice(0, 10);
  const [approvals, videos, attendance, notices, business] = await Promise.all([
    section("approvals", async () => {
      const { permission } = await requireProcurementAccess();
      const scope =
        permission.scope === "team" || permission.scope === "all"
          ? undefined
          : eq(procurement_item.submitter_user_id, userId);
      const canApprove = permission.points.has("approve");
      const pendingWhere = and(scope, eq(procurement_item.status, "pending_approval"));
      const mineWhere = and(scope, eq(procurement_item.submitter_user_id, userId));
      const projection = {
        id: procurement_item.id,
        title: procurement_item.item_name,
        submitter: procurement_item.submitter,
        price: procurement_item.price,
        quantity: procurement_item.quantity,
        status: procurement_item.status,
        created: procurement_item.created_at,
        usage: procurement_item.usage,
        remarks: procurement_item.remarks,
        invoice: procurement_item.invoice,
        link: procurement_item.link,
        screenshot: procurement_item.screenshot,
        requester: procurement_item.requester,
        platform: procurement_item.platform,
      };
      const [counts, pending, mine] = await Promise.all([
        db
          .select({
            pending: sql<number>`count(*) FILTER (WHERE ${procurement_item.status} = 'pending_approval')::int`,
            mine: sql<number>`count(*) FILTER (WHERE ${procurement_item.submitter_user_id} = ${userId})::int`,
          })
          .from(procurement_item)
          .where(scope),
        canApprove
          ? db
              .select(projection)
              .from(procurement_item)
              .where(pendingWhere)
              .orderBy(desc(procurement_item.created_at))
              .limit(4)
          : Promise.resolve([]),
        db
          .select(projection)
          .from(procurement_item)
          .where(mineWhere)
          .orderBy(desc(procurement_item.created_at))
          .limit(4),
      ]);
      const preview = (row: (typeof mine)[number]): ApprovalPreview => ({
        id: row.id,
        title: row.title,
        submitter: row.submitter || "未填写",
        amount: Number(row.price) * row.quantity,
        status: row.status,
        createdAt: row.created.toISOString(),
        price: Number(row.price),
        quantity: row.quantity,
        usage: row.usage,
        remarks: row.remarks,
        invoice: row.invoice,
        link: row.link,
        screenshot: row.screenshot,
        requester: row.requester,
        platform: row.platform,
      });
      return {
        canApprove,
        canCreate: permission.points.has("create"),
        pendingCount: canApprove ? Number(counts[0]?.pending ?? 0) : 0,
        mineCount: Number(counts[0]?.mine ?? 0),
        pending: pending.map(preview),
        mine: mine.map(preview),
      };
    }),
    section("videos", async () => {
      const permission = identity.isEmergency
        ? { scope: "all" as const }
        : await resolvePermission(userId, "editing_workflow");
      if (permission.scope === "none") throw new AppError("FORBIDDEN", "无剪辑权限", 403);
      const whereClause = await buildEditingScopeWhere({ scope: permission.scope, userId });
      const stages: VideoStage[] = ["uploaded", "editing", "review", "ready", "published"];
      const [counts, daily, ...previews] = await Promise.all([
        queryStatusCounts({ whereClause }),
        queryTodaySummary({ whereClause, dateFrom: today, dateTo: today }),
        ...stages.map((stage) =>
          db
            .select({
              id: editing_task.id,
              account: live_account.account_name,
              product: live_account.product,
              editor: dingtalk_user.name,
              date: editing_task.material_date,
              priority: editing_task.priority,
            })
            .from(editing_task)
            .leftJoin(live_account, eq(live_account.id, editing_task.live_account_id))
            .leftJoin(dingtalk_user, eq(dingtalk_user.user_id, editing_task.editor_user_id))
            .where(
              and(whereClause, isNull(editing_task.deleted_at), eq(editing_task.status, stage)),
            )
            .orderBy(
              sql`CASE WHEN ${editing_task.priority} = 'urgent' THEN 0 ELSE 1 END`,
              desc(editing_task.updated_at),
            )
            .limit(2),
        ),
      ]);
      const tasks = Object.fromEntries(
        stages.map((stage, i) => [
          stage,
          (previews[i] ?? []).map(
            (row): VideoPreview => ({
              id: row.id,
              account: row.account || "未知账号",
              product: row.product || "未分类",
              editor: row.editor,
              date: row.date.toISOString().slice(0, 10),
              urgent: row.priority === "urgent",
            }),
          ),
        ]),
      ) as Record<VideoStage, VideoPreview[]>;
      return { counts, today: daily, tasks };
    }),
    section("attendance", async () => {
      const permission = identity.isEmergency
        ? { scope: "all" as const, points: new Set(["remark"]) }
        : await resolvePermission(userId, "attendance");
      if (permission.scope === "none") throw new AppError("FORBIDDEN", "无考勤权限", 403);
      // Reuse the original request context, roster, grace and verification rules.
      const response = await dispatchAttendanceRequest(
        new Request(
          `http://localhost/api/attendance/pro3/attendance/summary?start_date=${yesterday}&end_date=${yesterday}`,
        ),
        ["attendance", "summary"],
      );
      const json = (await response.json()) as { success?: boolean; data?: unknown };
      if (!response.ok || !json.success) throw new Error("Attendance summary unavailable");
      const rows = attendanceSummarySchema.parse(json.data);
      return {
        team: summarizeAttendance(rows),
        mine: summarizeAttendance(rows.filter((row) => row.dingtalk_userid === userId)),
        canRemark: permission.points.has("remark"),
        scopeLabel:
          permission.scope === "all"
            ? "全员范围"
            : permission.scope === "team"
              ? "部门范围"
              : "授权范围",
      };
    }),
    section("notices", getWorkbenchNotices),
    section("business", async () => {
      const scope = identity.isEmergency
        ? { kind: "all" as const }
        : await resolveDashboardScope(userId);
      if (scope.kind === "reject") throw new AppError("FORBIDDEN", "无业务数据权限", 403);
      return getCoreKpis(yesterday, yesterday, scope);
    }),
  ]);
  return { today, yesterday, approvals, videos, attendance, notices, business };
}
