import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { DashboardScope } from "./scope";
import { ZHAOHUA_RECRUIT_BROKER_NAME } from "./types";

/**
 * Dashboard 核心 SQL：每个 anchor 映射到 (project, group)
 *
 * 项目：明确项目标记优先；其余按最近可识别的游戏记录，冲突或无依据时待确认。
 * 分组（broker_name → dingtalk_user → dept → entity_alias.alias）：
 *   - "线上运营" → online
 *   - "线下运营" → offline
 *   - "捕鱼运营" → other（不在斗地主/三国看板单独展示）
 *   - broker_name = "线上主播" → online（兜底）
 *   - 其他匹配不上 → other
 */
export function anchorGroupCte(scope: DashboardScope): SQL {
  // scope filter 直接落到 anchor_profile.broker_id，避免子查询
  let scopeFrag: SQL;
  if (scope.kind === "all") scopeFrag = sql`TRUE`;
  else if (scope.kind === "reject") scopeFrag = sql`FALSE`;
  else {
    const literal = scope.ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
    scopeFrag = sql`ap.broker_id = ANY(ARRAY[${sql.raw(literal)}]::text[])`;
  }
  // Recruiter names describe a recruiting relationship, not necessarily the game.
  // Keep explicit project assignments; resolve neutral recruiters from actual games.
  const gameProject = (name: SQL) => sql`CASE
    WHEN regexp_replace(${name}, '[[:space:]:：]', '', 'g') = '三国冰河时代' THEN 'three'
    WHEN ${name} LIKE '%斗地主%' THEN 'ddz'
    WHEN ${name} = '造化仙府' THEN 'zhaohua'
    ELSE NULL END`;
  return sql`
    anchor_candidates AS (
      SELECT ap.anchor_id, ap.nick_name, ap.broker_name, ap.recruit_broker_name, ap.is_threekingdoms
      FROM anchor_profile ap WHERE ap.is_archived = FALSE AND ${scopeFrag}
    ),
    product_activity AS (
      SELECT g.anchor_id, g.date, ${gameProject(sql`g.game_name`)} AS project
      FROM anchor_game_promo_daily g JOIN anchor_candidates ap ON ap.anchor_id = g.anchor_id
      WHERE NOT ap.is_threekingdoms AND ap.recruit_broker_name IS DISTINCT FROM ${ZHAOHUA_RECRUIT_BROKER_NAME}
        AND COALESCE(ap.recruit_broker_name, '') NOT IN ('三国项目', '三冰时代')
      UNION ALL
      SELECT m.anchor_id, m.date, ${gameProject(sql`m.mp_name`)} AS project
      FROM anchor_minigame_daily m JOIN anchor_candidates ap ON ap.anchor_id = m.anchor_id
      WHERE NOT ap.is_threekingdoms AND ap.recruit_broker_name IS DISTINCT FROM ${ZHAOHUA_RECRUIT_BROKER_NAME}
        AND COALESCE(ap.recruit_broker_name, '') NOT IN ('三国项目', '三冰时代')
    ),
    product_latest AS (
      SELECT anchor_id, CASE WHEN COUNT(DISTINCT project) = 1 THEN MIN(project) ELSE NULL END AS project,
        TRUE AS has_evidence
      FROM (
        SELECT anchor_id, project, DENSE_RANK() OVER (PARTITION BY anchor_id ORDER BY last_date DESC) AS latest_rank
        FROM (
          SELECT anchor_id, project, MAX(date) AS last_date FROM product_activity
          WHERE project IS NOT NULL GROUP BY anchor_id, project
        ) dates
      ) latest WHERE latest_rank = 1 GROUP BY anchor_id
    ),
    anchor_group AS (
      SELECT
        ap.anchor_id,
        ap.is_threekingdoms,
        du.user_id AS operator_id,
        du.dept_ids->>0 AS dept_id,
        CASE
          WHEN ap.recruit_broker_name = ${ZHAOHUA_RECRUIT_BROKER_NAME} THEN 'zhaohua'
          WHEN ap.is_threekingdoms OR ap.recruit_broker_name IN ('三国项目', '三冰时代') THEN 'three'
          ELSE pl.project
        END AS project,
        CASE
          WHEN ea.alias = '线上运营' THEN 'online'
          WHEN ea.alias = '线下运营' THEN 'offline'
          WHEN ap.broker_name = '线上主播' THEN 'online'
          ELSE 'other'
        END AS "group"
      FROM anchor_candidates ap
      LEFT JOIN product_latest pl ON pl.anchor_id = ap.anchor_id
      LEFT JOIN dingtalk_user du ON du.name = ap.broker_name
      LEFT JOIN entity_alias ea
        ON ea.entity_type = 'dept' AND ea.entity_id = du.dept_ids->>0
    )
  `;
}
