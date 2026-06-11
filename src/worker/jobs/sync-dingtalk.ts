/**
 * 钉钉同步任务（每天 02:00 全量 upsert）。
 *
 * 策略：
 * - 全量拉取 + upsert（不做增量）。1000 人以下规模，全量更简单更可靠
 * - 不在最新列表里的用户标记 active=false（不删除，保留历史）
 * - 写 audit_log 记录每次同步结果
 * - 失败发钉钉机器人通知（含"报错"关键词）
 *
 * listsimple 接口字段精简：仅有 userid + name (+ 可选 unionid)。
 * mobile / title 等需要 Phase 3 用 /topapi/v2/user/get 单独补。
 */
import { eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { dingtalk_dept, dingtalk_user } from "@/db/schema";
import {
  fetchAllDepartments,
  fetchAllUsers,
  type DingtalkDept,
  type DingtalkUser,
} from "@/lib/dingtalk";
import { writeAuditLog } from "@/lib/audit";
import { notifyError } from "@/lib/notify";
import { syncBrokerMappings } from "@/modules/brokers/server";

export async function syncDingtalk(): Promise<void> {
  const startTime = Date.now();
  let deptCount = 0;
  let userCount = 0;

  try {
    // 1. 同步部门
    const depts = await fetchAllDepartments();
    for (const dept of depts) {
      await upsertDept(dept);
      deptCount++;
    }
    console.log(`[sync-dingtalk] synced ${deptCount} depts`);

    // 2. 同步人员（fetchAllUsers 内部已按 userid 去重）
    const users = await fetchAllUsers();
    for (const user of users) {
      await upsertUser(user);
      userCount++;
    }
    console.log(`[sync-dingtalk] synced ${userCount} users`);

    // 3. 标记不在最新列表的 user 为 inactive（不删除）
    //    下限保护：本轮拉到的人数若低于现有 active 人数的 SAFE_DEACTIVATE_RATIO，
    //    判定为钉钉瞬时空返回 / 部门拉取不完整，跳过 deactivate 并告警，
    //    避免把在职员工批量误标离职（误标后当天起按未登录/无权限处理）。
    if (users.length > 0) {
      const seenIds = users.map((u) => u.userid);

      const activeRows = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(dingtalk_user)
        .where(eq(dingtalk_user.active, true));
      const activeCount = activeRows[0]?.count ?? 0;

      // 本轮人数 < 现有在职人数的 80% → 视为异常，跳过 deactivate
      const SAFE_DEACTIVATE_RATIO = 0.8;
      if (activeCount > 0 && seenIds.length < activeCount * SAFE_DEACTIVATE_RATIO) {
        console.warn(
          `[sync-dingtalk] 跳过离职标记：本轮拉到 ${seenIds.length} 人，低于现有在职 ${activeCount} 人的 ${SAFE_DEACTIVATE_RATIO * 100}%`,
        );
        await notifyError(
          new Error(
            `钉钉同步异常：本轮仅拉到 ${seenIds.length} 人，低于现有在职 ${activeCount} 人的 ${SAFE_DEACTIVATE_RATIO * 100}%，已跳过离职标记以防批量误标。请检查钉钉接口 / 通讯录。`,
          ),
          { context: "sync-dingtalk deactivate floor", fetched: seenIds.length, activeCount },
        );
      } else {
        await db.execute(
          sql`UPDATE dingtalk_user SET active = false, synced_at = NOW() WHERE user_id NOT IN (${sql.join(
            seenIds.map((i) => sql`${i}`),
            sql`, `,
          )}) AND active = true`,
        );
      }
    }

    // 4. 同步经纪人映射
    const brokerResult = await syncBrokerMappings();
    console.log(`[sync-brokers] matched=${brokerResult.matched} pending=${brokerResult.pending}`);

    // 5. 写审计日志
    await writeAuditLog({
      user_id: null,
      action: "DINGTALK_SYNC_SUCCESS",
      target_type: "system",
      target_id: null,
      after: { deptCount, userCount, durationMs: Date.now() - startTime },
    });

    console.log(
      `[sync-dingtalk] ✓ done: ${deptCount} depts, ${userCount} users in ${Date.now() - startTime}ms`,
    );
  } catch (err) {
    console.error("[sync-dingtalk] ✗ failed:", err);
    await notifyError(err, { context: "sync-dingtalk job", deptCount, userCount });
    await writeAuditLog({
      user_id: null,
      action: "DINGTALK_SYNC_FAILED",
      target_type: "system",
      target_id: null,
      after: { deptCount, userCount, error: String(err) },
    });
    throw err;
  }
}

async function upsertDept(dept: DingtalkDept): Promise<void> {
  await db
    .insert(dingtalk_dept)
    .values({
      dept_id: String(dept.dept_id),
      name: dept.name,
      parent_id: dept.parent_id != null ? String(dept.parent_id) : null,
      raw: dept,
    })
    .onConflictDoUpdate({
      target: dingtalk_dept.dept_id,
      set: {
        name: dept.name,
        parent_id: dept.parent_id != null ? String(dept.parent_id) : null,
        raw: dept,
        synced_at: new Date(),
      },
    });
}

async function upsertUser(user: DingtalkUser): Promise<void> {
  // listsimple 可能不返回 unionid，用 userid 兜底（unionid 是 NOT NULL UNIQUE）
  // dept_id_list 由 fetchAllUsers 在去重时合并，类型是 number[]，存库时转 string[]
  const unionid = user.unionid ?? user.userid;
  const deptIds = (user.dept_id_list ?? []).map(String);

  await db
    .insert(dingtalk_user)
    .values({
      user_id: user.userid,
      unionid,
      name: user.name,
      mobile: null, // listsimple 不返回，Phase 3 用 user/get 补
      title: null, // 同上
      dept_ids: deptIds,
      active: true, // listsimple 返回的都是在职
      raw: user,
    })
    .onConflictDoUpdate({
      target: dingtalk_user.user_id,
      set: {
        // listsimple 返回真实 unionid 时，以钉钉为准；没返回时保留现有值。
        unionid: sql`CASE WHEN excluded.unionid <> excluded.user_id THEN excluded.unionid ELSE ${dingtalk_user.unionid} END`,
        name: user.name,
        dept_ids: deptIds,
        active: true,
        raw: user,
        synced_at: new Date(),
      },
    });
}
