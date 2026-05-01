/**
 * 权限模块的「客户端 + 服务端通用」入口。
 *
 * 这里只暴露：
 * - 类型 / Zod schema
 * - 种子数据
 * - Server Actions（带 "use server"，可被 Client Component 安全 import）
 *
 * 依赖 `db/client` 的同步函数（resolvePermission / getManagedDeptIds 等）放在
 * 兄弟文件 `./server` 中，避免 client bundle 误拉 postgres 驱动。
 */
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

export { setDeptLeader, removeDeptLeader, upsertOverride, upsertRoleDefault } from "./actions";
