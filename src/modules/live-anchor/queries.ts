import "server-only";
import { db } from "@/db/client";
import { live_anchor, dingtalk_user } from "@/db/schema";
import { eq, and, inArray, sql, type SQL } from "drizzle-orm";
import { resolvePermission, getManagedDeptIds } from "@/modules/permissions/server";
import type { AnchorWithDingtalk } from "./types";
import type { BusinessLine } from "./schema";

export interface ListAnchorsParams {
  business_line?: BusinessLine;
  work_status?: "active" | "rest" | "leave";
}

/**
 * 按 live_anchor 模块的 scope 过滤主播档案。
 *
 * - all:  不过滤
 * - team: live_anchor.dingtalk_user_id ∈ 团队成员
 * - self: live_anchor.dingtalk_user_id = 自己（即看自己作为主播的档案）
 * - none: 直接返回 []
 */
export async function listAnchors(
  params: ListAnchorsParams = {},
  userId?: string,
  emergencyMode = false,
): Promise<AnchorWithDingtalk[]> {
  const conditions: SQL[] = [];

  if (!emergencyMode && userId) {
    const perm = await resolvePermission(userId, "live_anchor");
    // 委托视图：看 delegated 员工本人的 live_anchor 档案
    if (perm.delegatedUserIds && perm.delegatedUserIds.length > 0) {
      conditions.push(inArray(live_anchor.dingtalk_user_id, perm.delegatedUserIds));
    } else if (perm.scope === "none") {
      return [];
    } else if (perm.scope === "self") {
      conditions.push(eq(live_anchor.dingtalk_user_id, userId));
    } else if (perm.scope === "team") {
      const deptIds = await getManagedDeptIds(userId);
      if (deptIds.length === 0) return [];
      const teamUsers = await db
        .select({ user_id: dingtalk_user.user_id })
        .from(dingtalk_user)
        .where(
          sql`${dingtalk_user.dept_ids} ?| ${sql.raw(`ARRAY[${deptIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(",")}]::text[]`)}`,
        );
      if (teamUsers.length === 0) return [];
      conditions.push(
        inArray(
          live_anchor.dingtalk_user_id,
          teamUsers.map((u) => u.user_id),
        ),
      );
    }
  }

  if (params.business_line) {
    conditions.push(eq(live_anchor.business_line, params.business_line));
  }
  if (params.work_status) {
    conditions.push(eq(live_anchor.work_status, params.work_status));
  }

  const rows = await db
    .select({
      // anchor fields
      dingtalk_user_id: live_anchor.dingtalk_user_id,
      business_line: live_anchor.business_line,
      employment_type: live_anchor.employment_type,
      work_status: live_anchor.work_status,
      trial_start_date: live_anchor.trial_start_date,
      contract_date: live_anchor.contract_date,
      leave_date: live_anchor.leave_date,
      external_name: live_anchor.external_name,
      raw: live_anchor.raw,
      created_at: live_anchor.created_at,
      updated_at: live_anchor.updated_at,
      // dingtalk fields
      name: dingtalk_user.name,
      mobile: dingtalk_user.mobile,
      active: dingtalk_user.active,
      title: dingtalk_user.title,
    })
    .from(live_anchor)
    .innerJoin(dingtalk_user, eq(live_anchor.dingtalk_user_id, dingtalk_user.user_id))
    .where(conditions.length > 0 ? and(...conditions) : sql`true`)
    .orderBy(dingtalk_user.name);

  return rows;
}

export async function getAnchorById(
  dingtalk_user_id: string,
  userId?: string,
  emergencyMode = false,
): Promise<AnchorWithDingtalk | null> {
  const rows = await listAnchors({}, userId, emergencyMode);
  return rows.find((r) => r.dingtalk_user_id === dingtalk_user_id) ?? null;
}
