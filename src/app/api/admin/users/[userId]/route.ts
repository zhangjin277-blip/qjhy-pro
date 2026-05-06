import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import {
  auth_permission_override,
  dingtalk_dept,
  dingtalk_user,
  dept_leader,
  user_position_override,
} from "@/db/schema";
import { resolvePermission } from "@/modules/permissions/server";
import { MODULE_KEYS, type ModuleKey, type ResolvedPermission } from "@/modules/permissions";
import { getDeptAliasMap } from "@/modules/aliases/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";

export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "AUTH_NOT_LOGGED_IN" }, { status: 401 });

  const isEmergency = session.user.email === "emergency@qjhy.local";
  if (!isEmergency) {
    const [du] = await db
      .select({ user_id: dingtalk_user.user_id })
      .from(dingtalk_user)
      .where(eq(dingtalk_user.unionid, session.user.id));
    if (!du) return NextResponse.json({ error: "AUTH_USER_NOT_SYNCED" }, { status: 403 });
    const perm = await resolvePermission(du.user_id, "permissions");
    if (!perm.can_admin) return NextResponse.json({ error: "AUTH_FORBIDDEN" }, { status: 403 });
  }

  const { userId } = await params;

  const [user] = await db.select().from(dingtalk_user).where(eq(dingtalk_user.user_id, userId));
  if (!user) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const targetPermEntries = await Promise.all(
    MODULE_KEYS.map(async (m) => [m, await resolvePermission(userId, m)] as const),
  );
  const targetPermissions: Record<ModuleKey, ResolvedPermission> = Object.fromEntries(
    targetPermEntries,
  ) as Record<ModuleKey, ResolvedPermission>;

  const overrideRows = await db
    .select()
    .from(auth_permission_override)
    .where(eq(auth_permission_override.user_id, userId));

  const [posOverrideRow] = await db
    .select()
    .from(user_position_override)
    .where(eq(user_position_override.user_id, userId));

  const [leaderDepts, aliasMap] = await Promise.all([
    db
      .select({
        dept_id: dept_leader.dept_id,
        name: dingtalk_dept.name,
      })
      .from(dept_leader)
      .innerJoin(dingtalk_dept, eq(dept_leader.dept_id, dingtalk_dept.dept_id))
      .where(eq(dept_leader.user_id, userId)),
    getDeptAliasMap(),
  ]);

  const enrichedManagedDepts = leaderDepts.map((d) => {
    const a = aliasMap.get(d.dept_id);
    return {
      dept_id: d.dept_id,
      name: d.name,
      alias: a?.alias ?? null,
    };
  });

  // 把 user.dept_ids 也 join 部门名/别名（用户摘要卡显示用）
  const userDeptRows = user.dept_ids.length
    ? await db
        .select({ dept_id: dingtalk_dept.dept_id, name: dingtalk_dept.name })
        .from(dingtalk_dept)
        .where(inArray(dingtalk_dept.dept_id, user.dept_ids))
    : [];
  const userDepts = user.dept_ids.map((id) => {
    const row = userDeptRows.find((r) => r.dept_id === id);
    const a = aliasMap.get(id);
    return {
      dept_id: id,
      name: row?.name ?? id,
      alias: a?.alias ?? null,
    };
  });

  return NextResponse.json({
    user_id: user.user_id,
    name: user.name,
    title: user.title,
    dept_ids: user.dept_ids,
    dept_full: userDepts,
    assigned_position: posOverrideRow?.position ?? null, // 项目岗位（手动分配）
    effective_position: posOverrideRow?.position ?? user.title ?? "其他",
    permissions: targetPermissions,
    overrides: overrideRows,
    managedDepts: enrichedManagedDepts,
  });
}
