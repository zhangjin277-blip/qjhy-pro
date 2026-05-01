import type { Scope } from "./types";

/**
 * applyScopeFilter 的中间表示。
 *
 * 不同业务表的 join 方式不同（主播表 / 直播数据表 / ...），
 * 调用方根据 kind 决定怎么写 SQL WHERE 子句。
 */
export type ScopeWhereClause =
  | { kind: "none" } // no filter（看全部）
  | { kind: "reject" } // 1=0（看不到）
  | { kind: "self"; userId: string }
  | { kind: "team"; deptIds: string[] };

/**
 * 根据 scope 和 user 信息计算 WHERE 子句的逻辑形态。
 *
 * @param scope 用户的最终 scope
 * @param userId 当前用户 ID（钉钉 userid）
 * @param managedDeptIds 该用户作为 dept_leader 管理的部门 ID 列表（可空）
 */
export function buildScopeWhereClause(
  scope: Scope,
  userId: string,
  managedDeptIds: string[],
): ScopeWhereClause {
  if (scope === "all") return { kind: "none" };
  if (scope === "none") return { kind: "reject" };
  if (scope === "self") return { kind: "self", userId };
  if (scope === "team") {
    if (managedDeptIds.length === 0) return { kind: "reject" };
    return { kind: "team", deptIds: managedDeptIds };
  }
  // 兜底（理论上不到，TS 会保证）
  return { kind: "reject" };
}

/**
 * 查询给定用户作为 dept_leader 直接管理的部门 ID 列表。
 *
 * Phase 1 版本：不递归子部门（父部门 leader 不自动 ≤ 子部门）。
 * Phase 2 真用 TEAM scope 查业务数据时，按需加 PostgreSQL recursive CTE 拓展。
 */
export async function getManagedDeptIds(userId: string): Promise<string[]> {
  // 动态 import 避免单测时拉 db client（单测里不调这个函数）
  const { db } = await import("@/db/client");
  const { dept_leader } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const rows = await db
    .select({ dept_id: dept_leader.dept_id })
    .from(dept_leader)
    .where(eq(dept_leader.user_id, userId));
  return rows.map((r) => r.dept_id);
}
