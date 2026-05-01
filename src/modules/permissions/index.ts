export type { Scope, Permission, PermissionSource, ResolvedPermission } from "./types";

export {
  ScopeSchema,
  PermissionSchema,
  SetDeptLeaderInput,
  RemoveDeptLeaderInput,
  UpsertOverrideInput,
  UpsertRoleDefaultInput,
} from "./schema";

export { ROLE_DEFAULTS_SEED } from "./role-defaults";

export { resolvePermission, mergePermissions, scopeAtLeast, MAX_SCOPE } from "./resolve";

export { buildScopeWhereClause, getManagedDeptIds, type ScopeWhereClause } from "./scope";

export { setDeptLeader, removeDeptLeader, upsertOverride, upsertRoleDefault } from "./actions";
