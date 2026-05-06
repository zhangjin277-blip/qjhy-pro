import "server-only";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";

export interface BoardFilter {
  date_from: string; // ISO
  date_to: string; // ISO
  dataset_ids?: string[]; // 默认全部
  search?: string; // 账号名 / 主播名 模糊
}

function datasetClause(ds?: string[]) {
  if (!ds || ds.length === 0) return sql``;
  return sql`AND p.dataset_id IN (${sql.join(
    ds.map((d) => sql`${d}`),
    sql`, `,
  )})`;
}

export async function queryByAccount(filter: BoardFilter) {
  const { rows } = (await db.execute(sql`
    SELECT
      a.id              AS account_id,
      a.account_name,
      a.placement_label,
      a.platform,
      SUM(p.cost_yuan)::numeric    AS cost,
      SUM(p.activations)            AS activations,
      SUM(p.payment_yuan)::numeric  AS payment,
      SUM(p.start_download)         AS start_download,
      SUM(p.finish_download)        AS finish_download
    FROM placement_row p
    JOIN live_account a ON a.id = p.live_account_id
    WHERE p.date BETWEEN ${filter.date_from} AND ${filter.date_to}
    ${datasetClause(filter.dataset_ids)}
    ${filter.search ? sql`AND (a.account_name ILIKE ${"%" + filter.search + "%"} OR a.placement_label ILIKE ${"%" + filter.search + "%"})` : sql``}
    GROUP BY a.id, a.account_name, a.placement_label, a.platform
    ORDER BY cost DESC NULLS LAST
    LIMIT 200
  `)) as unknown as { rows: Record<string, unknown>[] };
  return rows;
}

export async function queryByAnchor(filter: BoardFilter) {
  const { rows } = (await db.execute(sql`
    SELECT
      p.attributed_dingtalk_user_id  AS user_id,
      du.name                         AS anchor_name,
      la.business_line                AS business_line,
      p.attribution_source            AS source,
      SUM(p.cost_yuan)::numeric       AS cost,
      SUM(p.activations)              AS activations,
      SUM(p.payment_yuan)::numeric    AS payment,
      COUNT(DISTINCT p.live_account_id) AS account_count
    FROM placement_row p
    LEFT JOIN dingtalk_user du ON du.user_id = p.attributed_dingtalk_user_id
    LEFT JOIN live_anchor la   ON la.dingtalk_user_id = p.attributed_dingtalk_user_id
    WHERE p.date BETWEEN ${filter.date_from} AND ${filter.date_to}
    ${datasetClause(filter.dataset_ids)}
    GROUP BY p.attributed_dingtalk_user_id, du.name, la.business_line, p.attribution_source
    ORDER BY cost DESC NULLS LAST
    LIMIT 200
  `)) as unknown as { rows: Record<string, unknown>[] };
  return rows;
}

export async function queryByHour(filter: BoardFilter) {
  const { rows } = (await db.execute(sql`
    SELECT
      p.live_account_id  AS account_id,
      a.account_name,
      p.hour,
      SUM(p.cost_yuan)::numeric     AS cost,
      SUM(p.activations)             AS activations,
      SUM(p.payment_yuan)::numeric   AS payment
    FROM placement_row p
    JOIN live_account a ON a.id = p.live_account_id
    WHERE p.date BETWEEN ${filter.date_from} AND ${filter.date_to}
    ${datasetClause(filter.dataset_ids)}
    GROUP BY p.live_account_id, a.account_name, p.hour
    ORDER BY a.account_name, p.hour
    LIMIT 5000
  `)) as unknown as { rows: Record<string, unknown>[] };
  return rows;
}
