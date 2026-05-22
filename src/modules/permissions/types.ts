export type Scope = "none" | "self" | "team" | "all";

export interface Permission {
  scope: Scope;
  can_edit: boolean;
  can_export: boolean;
  can_admin: boolean;
  /**
   * 委托视图：非空时直接以这些员工的 self 视角（agent IN (...)）覆盖 scope。
   * 由 auth_permission_override.delegated_user_ids 提供（邀请码注册时拷贝）。
   * 内部钉钉员工不配 → null/undefined → 走原 scope。
   */
  delegatedUserIds?: string[] | null;
}

export type PermissionSource =
  | { kind: "default"; position: string }
  | { kind: "dept_leader"; deptIds: string[] }
  | { kind: "override"; reason: string; expires_at: Date | null }
  | { kind: "delegated"; userIds: string[] };

export interface ResolvedPermission extends Permission {
  sources: PermissionSource[];
}
