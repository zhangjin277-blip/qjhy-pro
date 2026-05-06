import "server-only";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auth_permission_override,
  dept_leader,
  dingtalk_user,
  role_default_permission,
  user_position_override,
} from "@/db/schema";
import type { ModuleKey } from "./modules";
import type { Permission, PermissionSource, ResolvedPermission, Scope } from "./types";

const SCOPE_RANK: Record<Scope, number> = {
  none: 0,
  self: 1,
  team: 2,
  all: 3,
};

/** scope a 是否 ≥ scope b */
export function scopeAtLeast(a: Scope, b: Scope): boolean {
  return SCOPE_RANK[a] >= SCOPE_RANK[b];
}

/** 取两个 scope 的较强者（MAX） */
export function MAX_SCOPE(a: Scope, b: Scope): Scope {
  return SCOPE_RANK[a] >= SCOPE_RANK[b] ? a : b;
}

const NULL_PERMISSION: Permission = {
  scope: "none",
  can_edit: false,
  can_export: false,
  can_admin: false,
};

/**
 * 三层叠加合并：role default + dept_leader + override = final
 *
 * 规则：
 * - scope: MAX(role, dept_leader ? team : none, override.scope ?? none)
 * - can_*: override 显式给了用 override，否则用 role
 * - 注意：override 不能"降低" scope（防止误删 dept_leader 也降权限）
 */
export function mergePermissions(
  roleDefault: Permission,
  isDeptLeader: boolean,
  override: Partial<Permission> | null,
): Permission {
  const deptLeaderScope: Scope = isDeptLeader ? "team" : "none";
  const overrideScope: Scope = override?.scope ?? "none";

  const scope = MAX_SCOPE(MAX_SCOPE(roleDefault.scope, deptLeaderScope), overrideScope);

  return {
    scope,
    can_edit: override?.can_edit ?? roleDefault.can_edit,
    can_export: override?.can_export ?? roleDefault.can_export,
    can_admin: override?.can_admin ?? roleDefault.can_admin,
  };
}

/**
 * 查询给定用户在某个 module 的最终权限（含来源说明）。
 *
 * 步骤：
 * 1. 从 dingtalk_user 拿 title（钉钉岗位）
 * 2. 从 role_default_permission 按 (title, module) 拿默认权限（找不到 fallback 到 ("其他", module)）
 * 3. 从 dept_leader 看是否管部门
 * 4. 从 auth_permission_override 按 (user_id, module) 拿覆盖（且未过期）
 * 5. mergePermissions 合并
 */
export async function resolvePermission(
  userId: string,
  module: ModuleKey,
): Promise<ResolvedPermission> {
  const [user] = await db.select().from(dingtalk_user).where(eq(dingtalk_user.user_id, userId));

  if (!user) {
    return { ...NULL_PERMISSION, sources: [] };
  }

  // 1. 解析项目岗位：override > 钉钉 title > "其他"
  const [posOverride] = await db
    .select({ position: user_position_override.position })
    .from(user_position_override)
    .where(eq(user_position_override.user_id, userId));
  const position = posOverride?.position ?? user.title ?? "其他";
  const [roleRow] = await db
    .select()
    .from(role_default_permission)
    .where(
      and(
        eq(role_default_permission.position, position),
        eq(role_default_permission.module, module),
      ),
    );

  let role: Permission = NULL_PERMISSION;
  if (roleRow) {
    role = {
      scope: roleRow.scope,
      can_edit: roleRow.can_edit,
      can_export: roleRow.can_export,
      can_admin: roleRow.can_admin,
    };
  } else {
    const [fallbackRow] = await db
      .select()
      .from(role_default_permission)
      .where(
        and(
          eq(role_default_permission.position, "其他"),
          eq(role_default_permission.module, module),
        ),
      );
    if (fallbackRow) {
      role = {
        scope: fallbackRow.scope,
        can_edit: fallbackRow.can_edit,
        can_export: fallbackRow.can_export,
        can_admin: fallbackRow.can_admin,
      };
    }
  }

  // 2. dept_leader
  const leaderRows = await db.select().from(dept_leader).where(eq(dept_leader.user_id, userId));
  const isDeptLeader = leaderRows.length > 0;

  // 3. override（按 module，且未过期）
  const [overrideRow] = await db
    .select()
    .from(auth_permission_override)
    .where(
      and(
        eq(auth_permission_override.user_id, userId),
        eq(auth_permission_override.module, module),
        or(
          isNull(auth_permission_override.expires_at),
          gt(auth_permission_override.expires_at, new Date()),
        ),
      ),
    );

  const override: Partial<Permission> | null = overrideRow
    ? {
        ...(overrideRow.scope !== null ? { scope: overrideRow.scope } : {}),
        ...(overrideRow.can_edit !== null ? { can_edit: overrideRow.can_edit } : {}),
        ...(overrideRow.can_export !== null ? { can_export: overrideRow.can_export } : {}),
        ...(overrideRow.can_admin !== null ? { can_admin: overrideRow.can_admin } : {}),
      }
    : null;

  const merged = mergePermissions(role, isDeptLeader, override);

  // 4. 构造来源说明
  const sources: PermissionSource[] = [{ kind: "default", position }];
  if (isDeptLeader) {
    sources.push({ kind: "dept_leader", deptIds: leaderRows.map((r) => r.dept_id) });
  }
  if (overrideRow) {
    sources.push({
      kind: "override",
      reason: overrideRow.reason,
      expires_at: overrideRow.expires_at,
    });
  }

  return { ...merged, sources };
}
