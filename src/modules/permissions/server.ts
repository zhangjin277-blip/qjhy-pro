/**
 * 权限模块的「服务端专用」入口。
 *
 * 凡是依赖 `db/client` 的导出（resolvePermission 等），必须从这里 import，
 * 而不是从 `./index`。这样 client component 误 import 时不会把 db 客户端拖进
 * 浏览器 bundle，编译期就能发现问题。
 *
 * 现行 ESLint zone 已放行 `server.ts` 与 `index.ts`。
 */
export {
  resolvePermission,
  resolveVisibleModules,
  mergePermissions,
  scopeAtLeast,
  MAX_SCOPE,
} from "./resolve";
export { buildScopeWhereClause, getManagedDeptIds, type ScopeWhereClause } from "./scope";
