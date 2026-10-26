import "server-only";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  dingtalk_dept,
  dingtalk_user,
  editing_task,
  people_performance_profile,
} from "@/db/schema";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { businessDate } from "@/lib/business-date";
import { AppError } from "@/lib/errors";
import { resolvePermission } from "@/modules/permissions/server";
import { attendanceActor, dispatchAttendanceRequest } from "@/modules/attendance/server";
import { buildEditingScopeWhere } from "@/modules/editing-task/server";
import { dingtalkHireDate } from "@/modules/people-performance";
import { getDeptAliasMap } from "@/modules/aliases/server";
import { aggregateDepartments } from "./workbench-personnel-rules";
import { buildCalendar, calendarSourceSchema, monthBounds } from "./workbench-calendar-rules";
import { z } from "zod";
import type { ManagementData, PersonalCalendar } from "./workbench-management-types";
import type { WorkbenchSection } from "./workbench-types";

async function identity() {
  const actor = await getCurrentDingtalkUser();
  if (actor.kind !== "ok")
    throw new AppError(
      "AUTH_NOT_LOGGED_IN",
      "请先登录有效账号",
      actor.kind === "unauth" ? 401 : 403,
    );
  return actor;
}
async function loadSection<T>(
  load: () => Promise<T>,
): Promise<WorkbenchSection<T> & { hidden: boolean }> {
  try {
    return { data: await load(), error: null, hidden: false };
  } catch (error) {
    if (!(error instanceof AppError)) console.error("[workbench:management] section failed");
    return {
      data: null,
      hidden: error instanceof AppError && error.httpStatus === 403,
      error:
        error instanceof AppError && error.httpStatus === 403
          ? "暂无此板块权限"
          : "暂时无法加载，请刷新重试",
    };
  }
}
async function attendanceData(path: string, query: string): Promise<unknown> {
  const response = await dispatchAttendanceRequest(
    new Request(`http://localhost/api/attendance/pro3/attendance/${path}?${query}`),
    ["attendance", ...path.split("/")],
  );
  const json = await response.json();
  if (!response.ok || !json.success) throw new Error("Attendance unavailable");
  return json.data;
}
export async function getPersonalCalendar(month: string): Promise<PersonalCalendar> {
  const actor = await identity();
  try {
    monthBounds(month);
  } catch {
    throw new AppError("VALIDATION_ERROR", "月份格式应为 YYYY-MM", 400);
  }
  // Resolve access before looking up employee records, and never accept client-supplied names.
  await attendanceActor();
  const [person] = await db
    .select({ id: dingtalk_user.user_id, name: dingtalk_user.name })
    .from(dingtalk_user)
    .where(eq(dingtalk_user.user_id, actor.dingtalkUserId));
  if (!person)
    return { month, name: null, unavailable: "当前账号未关联员工，暂无个人考勤", days: [] };
  const source = calendarSourceSchema.parse(
    await attendanceData("calendar", new URLSearchParams({ month, user_id: person.id }).toString()),
  );
  source.records = source.records.filter((row) => row.dingtalk_userid === person.id);
  return {
    month,
    name: person.name,
    unavailable: null,
    days: buildCalendar(month, businessDate(), source),
  };
}
export async function getManagementWorkbench(): Promise<ManagementData> {
  const actor = await identity();
  const today = businessDate();
  const yesterday = new Date(new Date(`${today}T00:00:00Z`).getTime() - 86400000)
    .toISOString()
    .slice(0, 10);
  const month = today.slice(0, 7);
  const [personnel, editors] = await Promise.all([
    loadSection(async () => {
      // Card visibility is independent of personnel-performance access (which defaults to self).
      // Check it before any personnel, department, alias, or attendance query.
      if (!actor.isEmergency) {
        const workbench = await resolvePermission(actor.dingtalkUserId, "dashboard");
        if (!workbench.points.has("view_personnel"))
          throw new AppError("FORBIDDEN", "无部门人员概览权限", 403);
      }
      const permission = actor.isEmergency
        ? { scope: "all" as const, points: new Set<string>() }
        : await resolvePermission(actor.dingtalkUserId, "people_performance");
      const all =
        permission.scope === "all" ||
        ["manage_profiles", "calibrate", "manage_process"].some((point) =>
          permission.points.has(point),
        );
      if (permission.scope === "none" && !all)
        throw new AppError("FORBIDDEN", "无人员查看权限", 403);
      // Match personnel-performance's existing profile visibility; do not widen access via workbench.
      const rows = await db
        .select({
          id: dingtalk_user.user_id,
          name: dingtalk_user.name,
          title: dingtalk_user.title,
          deptIds: dingtalk_user.dept_ids,
          active: dingtalk_user.active,
          raw: dingtalk_user.raw,
          hireDate: people_performance_profile.hire_date,
          status: people_performance_profile.employment_status,
          firstSyncedAt: dingtalk_user.first_synced_at,
          lastInactiveAt: dingtalk_user.last_inactive_at,
        })
        .from(dingtalk_user)
        .leftJoin(
          people_performance_profile,
          eq(people_performance_profile.user_id, dingtalk_user.user_id),
        )
        .where(
          and(
            eq(dingtalk_user.is_external, false),
            all
              ? undefined
              : sql`(${dingtalk_user.user_id} = ${actor.dingtalkUserId} OR ${people_performance_profile.manager_user_id} = ${actor.dingtalkUserId} OR ${people_performance_profile.skip_manager_user_id} = ${actor.dingtalkUserId})`,
          ),
        );
      const depts = await db
        .select({
          id: dingtalk_dept.dept_id,
          name: dingtalk_dept.name,
          parentId: dingtalk_dept.parent_id,
        })
        .from(dingtalk_dept);
      const deptAliases = await getDeptAliasMap();
      let attendanceNote: string | null = null;
      let absentIds: Set<string> | null = null;
      let leaveIds: Set<string> | null = null;
      let allowedIds: string[] | null | undefined;
      try {
        const access = await attendanceActor();
        allowedIds = access.user.allowedUserIds;
        const query = `start_date=${yesterday}&end_date=${yesterday}`;
        const [summary, approved] = await Promise.all([
          attendanceData("summary", query),
          attendanceData("approvals/by-range", query),
        ]);
        const records = z
          .array(
            z.object({
              dingtalk_userid: z.string().nullable().optional(),
              absent_days_count: z.coerce.number(),
            }),
          )
          .parse(summary);
        const approvals = z
          .array(
            z.object({
              originator_userid: z.string().nullable().optional(),
              approval_type: z.string(),
            }),
          )
          .parse(approved);
        absentIds = new Set(
          records
            .filter((r) => r.absent_days_count > 0)
            .flatMap((r) => (r.dingtalk_userid ? [r.dingtalk_userid] : [])),
        );
        leaveIds = new Set(
          approvals
            .filter((r) => r.approval_type === "leave")
            .flatMap((r) => (r.originator_userid ? [r.originator_userid] : [])),
        );
      } catch {
        attendanceNote = "考勤数据暂不可用或无权限，缺勤／请假显示 —";
      }
      const departments = aggregateDepartments(
        rows.map((row) => {
          const raw = (row.raw || {}) as Record<string, unknown>;
          const hired = raw.hired_date;
          const canSeeAttendance =
            allowedIds !== undefined && (allowedIds === null || allowedIds.includes(row.id));
          return {
            id: row.id,
            name: row.name,
            title: row.title,
            deptIds: row.deptIds.map(String),
            status:
              !row.active || row.status === "inactive"
                ? ("inactive" as const)
                : row.status || ("unknown" as const),
            hireDate:
              row.hireDate ||
              dingtalkHireDate(
                typeof hired === "string" || typeof hired === "number" ? hired : null,
              ),
            firstSyncedDate: row.firstSyncedAt ? businessDate(row.firstSyncedAt) : null,
            lastInactiveDate: row.lastInactiveAt ? businessDate(row.lastInactiveAt) : null,
            absent: canSeeAttendance && absentIds ? absentIds.has(row.id) : null,
            leave: canSeeAttendance && leaveIds ? leaveIds.has(row.id) : null,
          };
        }),
        depts,
        month,
        deptAliases,
      );
      return { departments, attendanceNote };
    }),
    loadSection(async () => {
      const permission = actor.isEmergency
        ? { scope: "all" as const }
        : await resolvePermission(actor.dingtalkUserId, "editing_workflow");
      if (permission.scope === "none") throw new AppError("FORBIDDEN", "无剪辑权限", 403);
      const management = permission.scope === "all" || permission.scope === "team";
      if (!management) return { management, rows: [] };
      const where = await buildEditingScopeWhere({
        scope: permission.scope,
        userId: actor.dingtalkUserId,
      });
      const uploadedDate = sql`(${editing_task.edited_uploaded_at} AT TIME ZONE 'Asia/Shanghai')::date`;
      const rows = await db
        .select({
          id: editing_task.editor_user_id,
          name: dingtalk_user.name,
          today: sql<number>`count(*) FILTER (WHERE ${uploadedDate} = ${today}::date)::int`,
          month: sql<number>`count(*) FILTER (WHERE ${uploadedDate} BETWEEN ${month + "-01"}::date AND ${today}::date)::int`,
          editing: sql<number>`count(*) FILTER (WHERE ${editing_task.status} = 'editing')::int`,
          review: sql<number>`count(*) FILTER (WHERE ${editing_task.status} = 'review')::int`,
        })
        .from(editing_task)
        .leftJoin(dingtalk_user, eq(dingtalk_user.user_id, editing_task.editor_user_id))
        .where(and(where, isNull(editing_task.deleted_at), isNotNull(editing_task.editor_user_id)))
        .groupBy(editing_task.editor_user_id, dingtalk_user.name)
        .orderBy(
          desc(
            sql`count(*) FILTER (WHERE ${uploadedDate} BETWEEN ${month + "-01"}::date AND ${today}::date)`,
          ),
        );
      return {
        management,
        rows: rows
          .filter((r) => r.today + r.month + r.editing + r.review > 0)
          .map((r) => ({ ...r, id: r.id ?? "unknown", name: r.name || "未知人员" })),
      };
    }),
  ]);
  return { today, yesterday, month, personnel, editors };
}
