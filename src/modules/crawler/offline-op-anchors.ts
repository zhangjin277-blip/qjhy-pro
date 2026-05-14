import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/**
 * 解析"线下运营组"经纪人负责的主播 anchorId 名单。
 *
 * 数据流（纯 PG 查询）：
 *   1) entity_alias.alias='线下运营' → dept_id（实测 1072488184，对应"二组"）
 *   2) dingtalk_user.dept_ids 包含该 dept_id → 钉钉用户 user_id 集合
 *   3) broker_user_mapping → 抖音 broker_id 集合
 *   4) anchor_profile.broker_id IN (...) AND is_archived = false → anchor_id 列表
 */

export interface OfflineOpAnchor {
  anchor_id: string;
  nick_name: string;
  broker_name: string | null;
}

export async function resolveOfflineOpAnchors(
  opts: { aliasName?: string } = {},
): Promise<OfflineOpAnchor[]> {
  const aliasName = opts.aliasName ?? "线下运营";

  const rows = (await db.execute<{
    anchor_id: string;
    nick_name: string;
    broker_name: string | null;
  }>(sql`
    WITH offline_dept AS (
      SELECT entity_id::text AS dept_id
      FROM entity_alias
      WHERE entity_type = 'dept' AND alias = ${aliasName}
    ),
    offline_users AS (
      SELECT u.user_id
      FROM dingtalk_user u, offline_dept d
      WHERE u.active = true AND u.dept_ids @> jsonb_build_array(d.dept_id)
    ),
    offline_brokers AS (
      SELECT DISTINCT bum.broker_id
      FROM broker_user_mapping bum
      JOIN offline_users ou ON bum.dingtalk_user_id = ou.user_id
    )
    SELECT ap.anchor_id, ap.nick_name, ap.broker_name
    FROM anchor_profile ap
    WHERE ap.broker_id IN (SELECT broker_id FROM offline_brokers)
      AND ap.is_archived = false
  `)) as unknown as {
    anchor_id: string;
    nick_name: string;
    broker_name: string | null;
  }[];

  return rows;
}
