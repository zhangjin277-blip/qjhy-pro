import "server-only";
import { eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { broker_user_mapping, dept_leader, dingtalk_user } from "@/db/schema";
import { resolvePermission } from "@/modules/permissions/server";

/**
 * Dashboard 数据可见范围（按当前用户在 'dashboard' module 上的 scope 派生）。
 *
 * - all: 不限范围
 * - reject: 一行都看不到（直接 short-circuit 返回空）
 * - broker_ids: 仅这些经纪人负责的主播
 */
export type DashboardScope =
  | { kind: "all" }
  | { kind: "reject" }
  | { kind: "broker_ids"; ids: string[] };

/**
 * 解析当前用户在 dashboard 板块的可见范围。
 *
 * - scope=all → { kind: 'all' }
 * - scope=none → { kind: 'reject' }
 * - scope=self → 自己作为运营经纪人负责的所有主播（broker_user_mapping）
 * - scope=team → 自己管理的部门下所有用户负责的所有主播
 *
 * Emergency admin（user_id 不在 dingtalk_user）→ 自动 fallback 到 'all'
 * （因为 resolvePermission 找不到用户会返回 NULL_PERMISSION + sources=[]，scope='none'，
 *  这跟应急管理员预期不符；emergency 通过 session.user.email 在 API 入口手动给 all）
 */
export async function resolveDashboardScope(userId: string): Promise<DashboardScope> {
  const perm = await resolvePermission(userId, "dashboard");
  if (perm.scope === "all") return { kind: "all" };
  if (perm.scope === "none") return { kind: "reject" };

  if (perm.scope === "self") {
    const rows = await db
      .select({ broker_id: broker_user_mapping.broker_id })
      .from(broker_user_mapping)
      .where(eq(broker_user_mapping.dingtalk_user_id, userId));
    if (rows.length === 0) return { kind: "reject" };
    return { kind: "broker_ids", ids: rows.map((r) => r.broker_id) };
  }

  // team = 自己作为 dept_leader 管的部门 ∪ 自己 dingtalk_user.dept_ids
  // 这样组员（自动 dept_ids）和组长（额外 dept_leader 指派）都能看到自己组的数据。
  const [leaderRows, [userRow]] = await Promise.all([
    db
      .select({ dept_id: dept_leader.dept_id })
      .from(dept_leader)
      .where(eq(dept_leader.user_id, userId)),
    db
      .select({ dept_ids: dingtalk_user.dept_ids })
      .from(dingtalk_user)
      .where(eq(dingtalk_user.user_id, userId)),
  ]);
  const managedDeptIds = leaderRows.map((r) => r.dept_id);
  const ownDeptIds = userRow?.dept_ids ?? [];
  const deptIds = Array.from(new Set([...managedDeptIds, ...ownDeptIds]));
  if (deptIds.length === 0) return { kind: "reject" };

  const teamUsers = await db
    .select({ user_id: dingtalk_user.user_id })
    .from(dingtalk_user)
    .where(
      sql`${dingtalk_user.dept_ids} ?| ${sql.raw(`ARRAY[${deptIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(",")}]::text[]`)}`,
    );
  if (teamUsers.length === 0) return { kind: "reject" };

  const teamBrokers = await db
    .select({ broker_id: broker_user_mapping.broker_id })
    .from(broker_user_mapping)
    .where(
      inArray(
        broker_user_mapping.dingtalk_user_id,
        teamUsers.map((u) => u.user_id),
      ),
    );
  if (teamBrokers.length === 0) return { kind: "reject" };
  return { kind: "broker_ids", ids: teamBrokers.map((m) => m.broker_id) };
}

/**
 * 生成一个 SQL 片段：判断 anchor_id 是否在可见范围内。
 *
 * 使用方式：在能引用到 anchor_profile（或子查询能查到的）位置，把这个片段拼到 WHERE 里。
 *
 * - all: TRUE（不限制）
 * - reject: FALSE（强制过滤光）
 * - broker_ids: 子查询过滤 broker_id ∈ 指定 ids
 *
 * @param anchorIdRef 可调用方传入的 anchor_id 列引用，默认 `anchor_id`（裸列名）。
 *                   有别名时传 `sql\`ad.anchor_id\`` 之类。
 */
export function scopeAnchorWhere(scope: DashboardScope, anchorIdRef: SQL = sql`anchor_id`): SQL {
  if (scope.kind === "all") return sql`TRUE`;
  if (scope.kind === "reject") return sql`FALSE`;
  // 把 ids 拼成 PG 字符串数组字面量。broker_id 是简单字符串，做 SQL escape 防注入。
  const literal = scope.ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
  return sql`${anchorIdRef} IN (
    SELECT anchor_id FROM anchor_profile
    WHERE broker_id = ANY(ARRAY[${sql.raw(literal)}]::text[])
  )`;
}

/**
 * 给 anchor_profile 表（已 join）的 broker_id 列直接加 scope filter 的版本。
 * 当 SQL 里已经 FROM/JOIN anchor_profile（别名 ap）时用这个，避免子查询多一层。
 */
export function scopeBrokerWhere(scope: DashboardScope, brokerIdRef: SQL): SQL {
  if (scope.kind === "all") return sql`TRUE`;
  if (scope.kind === "reject") return sql`FALSE`;
  const literal = scope.ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
  return sql`${brokerIdRef} = ANY(ARRAY[${sql.raw(literal)}]::text[])`;
}
