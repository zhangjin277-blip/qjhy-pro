import "server-only";
import { db } from "@/db/client";
import { live_anchor, dingtalk_user } from "@/db/schema";
import { eq, and, sql, type SQL } from "drizzle-orm";
import type { AnchorWithDingtalk } from "./types";
import type { BusinessLine } from "./schema";

export interface ListAnchorsParams {
  business_line?: BusinessLine;
  work_status?: "active" | "rest" | "leave";
}

export async function listAnchors(params: ListAnchorsParams = {}): Promise<AnchorWithDingtalk[]> {
  const conditions: SQL[] = [];
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

export async function getAnchorById(dingtalk_user_id: string): Promise<AnchorWithDingtalk | null> {
  const rows = await listAnchors();
  return rows.find((r) => r.dingtalk_user_id === dingtalk_user_id) ?? null;
}
