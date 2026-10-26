import "server-only";
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { dingtalk_user } from "@/db/schema";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { AppError } from "@/lib/errors";
import { resolvePermission, getManagedDeptIds } from "@/modules/permissions/server";
import { getDatabase, dbGet } from "./server/runtime";

export async function attendanceActor() {
  const identity = await getCurrentDingtalkUser();
  if (identity.kind !== "ok") throw new AppError("AUTH_NOT_LOGGED_IN", "请先登录", 401);
  const permission = identity.isEmergency
    ? { scope: "all" as const, points: new Set(["sync", "remark", "approval", "export"]), delegatedUserIds: null }
    : await resolvePermission(identity.dingtalkUserId, "attendance");
  if (permission.scope === "none") throw new AppError("FORBIDDEN", "没有考勤模块权限", 403);
  const [current] = await db.select().from(dingtalk_user).where(eq(dingtalk_user.user_id, identity.dingtalkUserId));
  const name = current?.name || (identity.isEmergency ? "应急管理员" : "");
  let allowedNames: string[] | null = null;
  let allowedUserIds: string[] | null = null;
  let allowedDeptIds: string[] | null = null;
  if (permission.scope !== "all") {
    const departments = permission.scope === "team" ? await getManagedDeptIds(identity.dingtalkUserId) : [];
    const tree = departments.length ? await db.execute<{ dept_id: string }>(sql`
      WITH RECURSIVE managed AS (
        SELECT dept_id FROM dingtalk_dept WHERE dept_id IN (${sql.join(departments.map(id => sql`${id}`), sql`, `)})
        UNION
        SELECT d.dept_id FROM dingtalk_dept d JOIN managed m ON d.parent_id = m.dept_id
      ) SELECT dept_id FROM managed
    `) : [];
    const managedIds = new Set(tree.map(row => row.dept_id));
    const people = await db.select({ id: dingtalk_user.user_id, name: dingtalk_user.name, departments: dingtalk_user.dept_ids }).from(dingtalk_user);
    const visible = people.filter(person => person.id === identity.dingtalkUserId ||
      (person.departments || []).some(id => managedIds.has(String(id))));
    allowedUserIds = visible.map(person => person.id);
    const ids = new Set(allowedUserIds);
    // 旧版按姓名打开日历；同名且含范围外人员时拒绝该姓名入口。
    allowedNames = [...new Set(visible.map(person => person.name).filter(name => name &&
      !people.some(person => person.name === name && !ids.has(person.id))))];
    allowedDeptIds = [...new Set(visible.flatMap(person => person.departments || []).map(String))];
  }
  const legacy = await dbGet(getDatabase(), "SELECT id, team_id FROM users WHERE dingtalk_user_id = ? OR name = ? ORDER BY CASE WHEN dingtalk_user_id = ? THEN 0 ELSE 1 END LIMIT 1", [identity.dingtalkUserId, name, identity.dingtalkUserId]);
  const role = allowedNames === null ? "admin" : (permission.scope === "team" || permission.points.has("remark")) ? "team_leader" : "user";
  return {
    user: { id: legacy?.id ?? -Number.parseInt(createHash("sha256").update(identity.dingtalkUserId).digest("hex").slice(0, 12), 16), team_id: legacy?.team_id ?? null, name, display_name: name, username: name, role, allowedNames, allowedUserIds, allowedDeptIds, dingtalk_userid: identity.dingtalkUserId, scopes: { attendance: allowedNames === null ? "all" : "personal" } },
    permissions: [...permission.points],
  };
}
