import "server-only";
import { db } from "@/db/client";
import {
  anchor_daily,
  anchor_profile,
  anchor_minigame_daily,
  anchor_game_promo_daily,
  broker_user_mapping,
  dingtalk_user,
} from "@/db/schema";
import { and, eq, sql, inArray, gt } from "drizzle-orm";
import { resolvePermission, getManagedDeptIds } from "@/modules/permissions/server";
import type { DashboardCards, TrendPoint } from "./types";

/**
 * 计算用户的可见 broker_id 列表（scope 过滤）。
 *
 * - null  = scope=all（无过滤）
 * - []    = scope=none（空结果）
 * - [...] = scope=self/team（子集）
 *
 * NOTE: 同 T12 anchors/queries.ts — resolvePermission 不含 team_user_ids，
 * team scope 实现方式：getManagedDeptIds → dingtalk_user.dept_ids ?| array → broker_user_mapping
 */
async function applyScope(userId: string): Promise<string[] | null> {
  const perm = await resolvePermission(userId);

  if (perm.scope === "all") return null;
  if (perm.scope === "none") return [];

  if (perm.scope === "self") {
    const rows = await db
      .select({ broker_id: broker_user_mapping.broker_id })
      .from(broker_user_mapping)
      .where(eq(broker_user_mapping.dingtalk_user_id, userId));
    return rows.map((r) => r.broker_id);
  }

  // scope === "team"
  const deptIds = await getManagedDeptIds(userId);
  if (deptIds.length === 0) return [];

  const teamUsers = await db
    .select({ user_id: dingtalk_user.user_id })
    .from(dingtalk_user)
    .where(
      sql`${dingtalk_user.dept_ids} ?| ${sql.raw(`ARRAY[${deptIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(",")}]::text[]`)}`,
    );
  if (teamUsers.length === 0) return [];

  const teamBrokers = await db
    .select({ broker_id: broker_user_mapping.broker_id })
    .from(broker_user_mapping)
    .where(
      inArray(
        broker_user_mapping.dingtalk_user_id,
        teamUsers.map((u) => u.user_id),
      ),
    );
  return teamBrokers.map((r) => r.broker_id);
}

export async function getDashboardCards(userId: string, date: string): Promise<DashboardCards> {
  const brokerIds = await applyScope(userId);

  const empty: DashboardCards = {
    total_fan_ticket_today: 0,
    active_anchors_today: 0,
    minigame_income_today: 0,
    game_income_today: 0,
    health_warn_count: 0,
    violation_count: 0,
  };
  if (brokerIds !== null && brokerIds.length === 0) return empty;

  const profileFilter =
    brokerIds === null ? undefined : inArray(anchor_profile.broker_id, brokerIds);

  // 1. 总音浪 + 开播主播数
  const dailyAgg = await db
    .select({
      total_ft: sql<number>`COALESCE(SUM(${anchor_daily.total_fan_ticket}), 0)`,
      active: sql<number>`COUNT(*) FILTER (WHERE ${anchor_daily.live_duration_1d} > 0)`,
    })
    .from(anchor_daily)
    .innerJoin(anchor_profile, eq(anchor_daily.anchor_id, anchor_profile.anchor_id))
    .where(and(eq(anchor_daily.date, date), profileFilter));

  // 2. minigame income
  const mgAgg = await db
    .select({
      sum: sql<number>`COALESCE(SUM(${anchor_minigame_daily.after_divided_author_income}), 0)`,
    })
    .from(anchor_minigame_daily)
    .innerJoin(anchor_profile, eq(anchor_minigame_daily.anchor_id, anchor_profile.anchor_id))
    .where(and(eq(anchor_minigame_daily.date, date), profileFilter));

  // 3. game income
  const gameAgg = await db
    .select({
      sum: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_anchor_income_1d}), 0)`,
    })
    .from(anchor_game_promo_daily)
    .innerJoin(anchor_profile, eq(anchor_game_promo_daily.anchor_id, anchor_profile.anchor_id))
    .where(and(eq(anchor_game_promo_daily.date, date), profileFilter));

  // 4. 健康分 < 60
  const warn = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(anchor_profile)
    .where(and(sql`${anchor_profile.anchor_health_score} < 60`, profileFilter));

  // 5. 违规
  const violations = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(anchor_profile)
    .where(and(gt(anchor_profile.anchor_violation_30d, 0), profileFilter));

  return {
    total_fan_ticket_today: Number(dailyAgg[0]?.total_ft ?? 0),
    active_anchors_today: Number(dailyAgg[0]?.active ?? 0),
    minigame_income_today: Number(mgAgg[0]?.sum ?? 0),
    game_income_today: Number(gameAgg[0]?.sum ?? 0),
    health_warn_count: Number(warn[0]?.c ?? 0),
    violation_count: Number(violations[0]?.c ?? 0),
  };
}

export async function getTrend(userId: string, days: number): Promise<TrendPoint[]> {
  const brokerIds = await applyScope(userId);
  if (brokerIds !== null && brokerIds.length === 0) return [];

  const profileFilter =
    brokerIds === null ? undefined : inArray(anchor_profile.broker_id, brokerIds);

  const rows = await db
    .select({
      date: anchor_daily.date,
      total_fan_ticket: sql<number>`COALESCE(SUM(${anchor_daily.total_fan_ticket}), 0)`,
      total_duration: sql<number>`COALESCE(SUM(${anchor_daily.live_duration_1d}), 0)`,
    })
    .from(anchor_daily)
    .innerJoin(anchor_profile, eq(anchor_daily.anchor_id, anchor_profile.anchor_id))
    .where(and(sql`${anchor_daily.date} >= (CURRENT_DATE - ${days}::int)`, profileFilter))
    .groupBy(anchor_daily.date)
    .orderBy(anchor_daily.date);

  return rows.map((r) => ({
    date: r.date,
    total_fan_ticket: Number(r.total_fan_ticket),
    total_duration: Number(r.total_duration),
  }));
}
