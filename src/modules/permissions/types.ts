export type Scope = "none" | "self" | "team" | "all";

export interface Permission {
  scope: Scope;
  /**
   * 该板块已开通的权限点集合（板块内短 key，如 "account_edit"）。
   * 注册表见 modules.ts MODULE_POINTS；判权用 hasPoint(perm, key)。
   */
  points: ReadonlySet<string>;
  /**
   * 委托视图：非空时直接以这些员工的 self 视角（agent IN (...)）覆盖 scope。
   * 由 auth_permission_override.delegated_user_ids 提供（邀请码注册时拷贝）。
   * 内部钉钉员工不配 → null/undefined → 走原 scope。
   */
  delegatedUserIds?: string[] | null;
}

/** 判定某板块权限里是否开通了指定权限点 */
export function hasPoint(perm: Pick<Permission, "points">, key: string): boolean {
  return perm.points.has(key);
}

export type PermissionSource =
  | { kind: "super_admin" }
  | { kind: "default"; position: string }
  | { kind: "dept_leader"; deptIds: string[] }
  | { kind: "override"; reason: string; expires_at: Date | null }
  | { kind: "delegated"; userIds: string[] };

export interface ResolvedPermission extends Permission {
  sources: PermissionSource[];
}
