export type Scope = "none" | "self" | "team" | "all";

export interface Permission {
  scope: Scope;
  can_edit: boolean;
  can_export: boolean;
  can_admin: boolean;
}

export type PermissionSource =
  | { kind: "default"; position: string }
  | { kind: "dept_leader"; deptIds: string[] }
  | { kind: "override"; reason: string; expires_at: Date | null };

export interface ResolvedPermission extends Permission {
  sources: PermissionSource[];
}
