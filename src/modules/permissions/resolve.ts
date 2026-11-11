import "server-only";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auth_permission_override,
  auth_super_admin,
  dept_leader,
  dingtalk_user,
  role_default_permission,
  user_position_override,
} from "@/db/schema";
import { MODULE_KEYS, MODULE_POINTS, type ModuleKey } from "./modules";
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

const EMPTY_POINTS: ReadonlySet<string> = new Set();

const NULL_PERMISSION: Permission = {
  scope: "none",
  points: EMPTY_POINTS,
  delegatedUserIds: null,
};

/**
 * 岗位与管理部门提供通用权限，个人设置逐字段优先。
 *
 * - scope: 个人非 null 设置直接生效（可扩大或收窄，含 none）；
 *   未设置时取 MAX(role, dept_leader ? team : none)
 * - points: override.points 非 null → 整体替换；null → 用岗位默认
 * - dept_leader 只影响 scope，不加权限点
 */
export function mergePermissions(
  roleDefault: { scope: Scope; points: string[] },
  isDeptLeader: boolean,
  override: { scope?: Scope | null; points?: string[] | null } | null,
): Permission {
  const deptLeaderScope: Scope = isDeptLeader ? "team" : "none";
  const scope = override?.scope ?? MAX_SCOPE(roleDefault.scope, deptLeaderScope);
  const points = new Set(
    override?.points !== null && override?.points !== undefined
      ? override.points
      : roleDefault.points,
  );

  return { scope, points };
}

export async function isSuperAdmin(userId: string): Promise<boolean> {
  const [grant] = await db
    .select({ userId: auth_super_admin.user_id })
    .from(auth_super_admin)
    .innerJoin(dingtalk_user, eq(dingtalk_user.user_id, auth_super_admin.user_id))
    .where(
      and(
        eq(auth_super_admin.user_id, userId),
        eq(dingtalk_user.active, true),
        eq(dingtalk_user.is_external, false),
      ),
    );
  return !!grant;
}

/**
 * 查询给定用户在某个 module 的最终权限（含来源说明）。
 *
 * 步骤：
 * 1. 从 dingtalk_user 拿 title（钉钉岗位）；user_position_override 优先
 * 2. 从 role_default_permission 按 (position, module) 拿默认（找不到 fallback ("其他", module)）
 * 3. 从 dept_leader 看是否管部门（提供默认 team 范围）
 * 4. 从 auth_permission_override 按 (user_id, module) 拿覆盖（且未过期）
 * 5. mergePermissions 合并：个人有设置的字段优先，未设置字段沿用通用配置
 */
export async function resolvePermission(
  userId: string,
  module: ModuleKey,
): Promise<ResolvedPermission> {
  const [user] = await db.select().from(dingtalk_user).where(eq(dingtalk_user.user_id, userId));

  if (!user) {
    return { ...NULL_PERMISSION, sources: [] };
  }

  if (await isSuperAdmin(userId)) {
    return {
      scope: "all",
      points: new Set(MODULE_POINTS[module].map((p) => p.key)),
      delegatedUserIds: null,
      sources: [{ kind: "super_admin" }],
    };
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

  let role: { scope: Scope; points: string[] } = { scope: "none", points: [] };
  if (roleRow) {
    role = { scope: roleRow.scope, points: roleRow.points };
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
      role = { scope: fallbackRow.scope, points: fallbackRow.points };
    }
  }

  // 全员默认可读取自己的考勤，不依赖岗位权限是否已初始化。
  if (module === "attendance") role = { scope: "self", points: ["approval"] };

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

  const override = overrideRow
    ? {
        ...(overrideRow.scope !== null ? { scope: overrideRow.scope } : {}),
        points: overrideRow.points,
      }
    : null;

  const merged = mergePermissions(role, isDeptLeader, override);
  if (module === "attendance") {
    // 范围沿用合并结果：默认本人 / 负责部门，管理员明确设置的个人范围优先。
    merged.points = new Set([...merged.points, "approval"]);
  }

  // 委托视图：override.delegated_user_ids 非空数组才生效；保留独立的委托范围规则
  const delegatedRaw = overrideRow?.delegated_user_ids as string[] | null | undefined;
  const delegatedUserIds =
    module !== "attendance" && Array.isArray(delegatedRaw) && delegatedRaw.length > 0
      ? delegatedRaw
      : null;

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
  if (delegatedUserIds) {
    sources.push({ kind: "delegated", userIds: delegatedUserIds });
  }

  return { ...merged, delegatedUserIds, sources };
}

/**
 * 一次性算出某用户在 sidebar 上可见的 module 集合。
 * 可见 = scope !== "none" 或 开通了任意权限点。
 */
export async function resolveVisibleModules(userId: string): Promise<Set<ModuleKey>> {
  const perms = await Promise.all(MODULE_KEYS.map((m) => resolvePermission(userId, m)));
  const visible = new Set<ModuleKey>();
  MODULE_KEYS.forEach((m, i) => {
    const p = perms[i];
    if (!p) return;
    if (m === "goals") {
      if (p.scope !== "none" && p.points.has("view")) visible.add(m);
    } else if (p.scope !== "none" || p.points.size > 0) visible.add(m);
  });
  return visible;
}
