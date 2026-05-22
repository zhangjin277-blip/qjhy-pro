import { db } from "@/db/client";
import {
  auth_permission_override,
  dingtalk_dept,
  dingtalk_user,
  dept_leader,
  user_position_override,
} from "@/db/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { isAppError } from "@/lib/errors";
import { resolvePermission } from "@/modules/permissions/server";
import { MODULE_KEYS, type ModuleKey, type ResolvedPermission } from "@/modules/permissions";
import { getDeptAliasMap } from "@/modules/aliases/server";
import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";

export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json(
      { error: isAppError(err) ? err.code : "AUTH_FORBIDDEN" },
      { status: isAppError(err) ? err.httpStatus : 403 },
    );
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

  // 委托视图：取所有 override 行中 delegated_user_ids 的并集
  // （actions 写入时保证同一用户各 module 同步，但保险起见用并集容错）
  const delegatedSet = new Set<string>();
  for (const row of overrideRows) {
    const arr = row.delegated_user_ids as string[] | null;
    if (Array.isArray(arr)) arr.forEach((id) => delegatedSet.add(id));
  }
  const delegatedUserIds = [...delegatedSet];

  // 附带 delegated 员工的姓名（UI 渲染 chip 用）
  const delegatedUsers =
    delegatedUserIds.length > 0
      ? await db
          .select({ user_id: dingtalk_user.user_id, name: dingtalk_user.name })
          .from(dingtalk_user)
          .where(inArray(dingtalk_user.user_id, delegatedUserIds))
      : [];

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
    delegated_users: delegatedUsers,
  });
}
