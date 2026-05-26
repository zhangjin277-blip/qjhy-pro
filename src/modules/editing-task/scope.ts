import "server-only";
import { editing_task } from "@/db/schema";
import type { Scope } from "@/modules/permissions";
import { getManagedDeptIds } from "@/modules/permissions/server";
import { eq, or, sql, type SQL } from "drizzle-orm";

/**
 * 剪辑任务数据可见性 WHERE 子句构建器（spec §6.2）。
 *
 * - all:  无 where（看全部）
 * - none: sql`false`（看不到任何）
 * - self: created_by_user_id == me
 *         OR editor_user_id == me
 *         OR live_account.agent_dingtalk_user_id == me（负责账号）
 *         OR anchor_profile.dingtalk_user_id == me（自己是主播）
 * - team: self 条件 UNION 自己作为 leader 的部门成员负责的账号
 *
 * 注意：live_account 里运营字段是 agent_dingtalk_user_id（不是 operator_user_id）。
 *       anchor_profile 里主播对应钉钉用户的字段是 dingtalk_user_id（无 live_anchor 中间表）。
 */
export async function buildEditingScopeWhere(args: {
  scope: Scope;
  userId: string;
}): Promise<SQL | undefined> {
  const { scope, userId } = args;

  if (scope === "all") return undefined;
  if (scope === "none") return sql`false`;

  // self 条件：4 种 OR（spec §6.2 原始定义，不开公共池）
  const selfCondition = or(
    eq(editing_task.created_by_user_id, userId),
    eq(editing_task.editor_user_id, userId),
    sql`${editing_task.live_account_id} IN (
      SELECT id FROM live_account WHERE agent_dingtalk_user_id = ${userId}
    )`,
    sql`${editing_task.anchor_id} IN (
      SELECT anchor_id FROM anchor_profile WHERE dingtalk_user_id = ${userId}
    )`,
  );

  if (scope === "self") return selfCondition;

  // team: self + 部门成员负责的账号
  const deptIds = await getManagedDeptIds(userId);
  if (deptIds.length === 0) return selfCondition;

  // dept_ids 是 JSONB 数组，用 ?| 检查是否包含任一管理的部门 ID
  // 用参数化绑定，避免 sql.raw 字符串插值（参数化：${d} 在 sql 模板内是绑定参数）
  const placeholders = deptIds.map((d) => sql`${d}`);
  const arrayLiteral = sql.join(placeholders, sql`, `);
  return or(
    selfCondition,
    sql`${editing_task.live_account_id} IN (
      SELECT la.id FROM live_account la
      JOIN dingtalk_user u ON la.agent_dingtalk_user_id = u.user_id
      WHERE u.dept_ids ?| ARRAY[${arrayLiteral}]::text[]
    )`,
  );
}
