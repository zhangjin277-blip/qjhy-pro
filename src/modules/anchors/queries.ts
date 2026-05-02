import "server-only";
import { db } from "@/db/client";
import {
  anchor_profile,
  anchor_daily,
  anchor_minigame_daily,
  anchor_game_promo_daily,
  broker_user_mapping,
  dingtalk_user,
} from "@/db/schema";
import { and, eq, sql, inArray, gte, like, or } from "drizzle-orm";
import { resolvePermission } from "@/modules/permissions/server";
import { getManagedDeptIds } from "@/modules/permissions/server";
import type { AnchorListFilters, AnchorListRow } from "./types";

/**
 * 按用户权限过滤的主播明细查询。
 * - scope=all: 全部
 * - scope=team: 当前 user 管理的部门下经纪人映射的主播
 * - scope=self: 当前 user 对应 broker 的主播
 * - scope=none: 空
 *
 * NOTE: resolvePermission (Phase 1) 返回 ResolvedPermission，不含 team_user_ids。
 * team scope 实现：getManagedDeptIds → 找 dingtalk_user.dept_ids 有交集的用户 → broker_user_mapping。
 * Phase 3 如需递归子部门，升级 getManagedDeptIds 即可，此处逻辑无需改动。
 */
export async function listAnchors(
  userId: string,
  filters: AnchorListFilters,
): Promise<AnchorListRow[]> {
  const perm = await resolvePermission(userId);
  if (perm.scope === "none") return [];

  const where: ReturnType<typeof eq>[] = [];

  // scope 过滤
  if (perm.scope === "self") {
    const myBroker = await db
      .select({ broker_id: broker_user_mapping.broker_id })
      .from(broker_user_mapping)
      .where(eq(broker_user_mapping.dingtalk_user_id, userId));
    if (myBroker.length === 0) return [];
    where.push(
      inArray(
        anchor_profile.broker_id,
        myBroker.map((m) => m.broker_id),
      ),
    );
  } else if (perm.scope === "team") {
    // Phase 1 未提供 team_user_ids，通过 getManagedDeptIds → dingtalk_user.dept_ids 推导
    const deptIds = await getManagedDeptIds(userId);
    if (deptIds.length === 0) return [];

    // 找在这些部门中的 dingtalk_user（dept_ids 是 jsonb string[]）
    // 使用 ?| 运算符：jsonb_column ?| array['d1','d2']
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
    if (teamBrokers.length === 0) return [];
    where.push(
      inArray(
        anchor_profile.broker_id,
        teamBrokers.map((m) => m.broker_id),
      ),
    );
  }
  // scope=all: no additional where clause

  // 业务筛
  if (filters.project === "ddz") {
    where.push(eq(anchor_profile.is_threekingdoms, false));
  } else if (filters.project === "three") {
    where.push(eq(anchor_profile.is_threekingdoms, true));
  }
  if (filters.broker_ids && filters.broker_ids.length > 0) {
    where.push(inArray(anchor_profile.broker_id, filters.broker_ids));
  }
  if (filters.health_min !== undefined) {
    where.push(gte(anchor_profile.anchor_health_score, filters.health_min));
  }
  if (filters.search) {
    const condition = or(
      like(anchor_profile.nick_name, `%${filters.search}%`),
      like(anchor_profile.aweme_display_id, `%${filters.search}%`),
    );
    if (condition) where.push(condition);
  }

  // 主表: anchor_profile LEFT JOIN anchor_daily(日期范围内) GROUP BY anchor_id 做汇总
  const dateRange = and(
    sql`${anchor_daily.date} >= ${filters.date_from}`,
    sql`${anchor_daily.date} <= ${filters.date_to}`,
  );

  const rows = await db
    .select({
      anchor_id: anchor_profile.anchor_id,
      nick_name: anchor_profile.nick_name,
      is_threekingdoms: anchor_profile.is_threekingdoms,
      broker_name: anchor_profile.broker_name,
      recruit_broker_name: anchor_profile.recruit_broker_name,
      anchor_health_score: anchor_profile.anchor_health_score,

      total_fan_ticket: sql<string>`COALESCE(SUM(${anchor_daily.total_fan_ticket}), 0)`,
      live_fan_ticket_no_guest: sql<string>`COALESCE(SUM(${anchor_daily.live_fan_ticket_no_guest}), 0)`,
      property_fan_ticket_no_guest: sql<string>`COALESCE(SUM(${anchor_daily.property_fan_ticket_no_guest}), 0)`,
      guest_fan_ticket: sql<string>`COALESCE(SUM(${anchor_daily.guest_fan_ticket}), 0)`,
      activity_fan_ticket_no_guest: sql<string>`COALESCE(SUM(${anchor_daily.activity_fan_ticket_no_guest}), 0)`,
      special_fan_ticket: sql<string>`COALESCE(SUM(${anchor_daily.special_fan_ticket}), 0)`,
      subscribe_fan_ticket: sql<string>`COALESCE(SUM(${anchor_daily.subscribe_fan_ticket}), 0)`,
      star_guard_earn_score: sql<string>`COALESCE(SUM(${anchor_daily.star_guard_earn_score}), 0)`,

      live_duration: sql<string>`COALESCE(SUM(${anchor_daily.live_duration_1d}), 0)`,
      valid_live_duration: sql<string>`COALESCE(SUM(${anchor_daily.valid_live_duration_1d}), 0)`,
      live_days: sql<number>`COUNT(*) FILTER (WHERE ${anchor_daily.live_duration_1d} > 0)`,
      solo_valid_days: sql<number>`COALESCE(SUM(${anchor_daily.is_solo_valid_day}), 0)`,
      new_follow_fans: sql<number>`COALESCE(SUM(${anchor_daily.new_follow_fans_1d}), 0)`,
      peak_per_minute_ucnt: sql<number>`COALESCE(MAX(${anchor_daily.peak_per_minute_ucnt}), 0)`,
      feed_acu: sql<number>`COALESCE(MAX(${anchor_daily.feed_acu}), 0)`,
      feed_watch_duration: sql<string>`COALESCE(SUM(${anchor_daily.feed_watch_duration_1d}), 0)`,

      video_view_count: sql<number>`COALESCE(SUM(${anchor_daily.video_view_count}), 0)`,
      video_like_count: sql<number>`COALESCE(SUM(${anchor_daily.video_like_count}), 0)`,
      video_comment_count: sql<number>`COALESCE(SUM(${anchor_daily.video_comment_count}), 0)`,

      total_fans: sql<number>`COALESCE(MAX(${anchor_daily.total_fans}), 0)`,
    })
    .from(anchor_profile)
    .leftJoin(anchor_daily, and(eq(anchor_profile.anchor_id, anchor_daily.anchor_id), dateRange))
    .where(where.length > 0 ? and(...where) : undefined)
    .groupBy(
      anchor_profile.anchor_id,
      anchor_profile.nick_name,
      anchor_profile.is_threekingdoms,
      anchor_profile.broker_name,
      anchor_profile.recruit_broker_name,
      anchor_profile.anchor_health_score,
    )
    .orderBy(sql`COALESCE(SUM(${anchor_daily.total_fan_ticket}), 0) DESC`)
    .limit(5000);

  const anchorIds = rows.map((r) => r.anchor_id);
  if (anchorIds.length === 0) return [];

  const mgIncomes = await db
    .select({
      anchor_id: anchor_minigame_daily.anchor_id,
      sum_income: sql<number>`SUM(${anchor_minigame_daily.after_divided_author_income})`,
    })
    .from(anchor_minigame_daily)
    .where(
      and(
        inArray(anchor_minigame_daily.anchor_id, anchorIds),
        sql`${anchor_minigame_daily.date} >= ${filters.date_from}`,
        sql`${anchor_minigame_daily.date} <= ${filters.date_to}`,
      ),
    )
    .groupBy(anchor_minigame_daily.anchor_id);

  const gameIncomes = await db
    .select({
      anchor_id: anchor_game_promo_daily.anchor_id,
      sum_income: sql<number>`SUM(${anchor_game_promo_daily.promote_anchor_income_1d})`,
    })
    .from(anchor_game_promo_daily)
    .where(
      and(
        inArray(anchor_game_promo_daily.anchor_id, anchorIds),
        sql`${anchor_game_promo_daily.date} >= ${filters.date_from}`,
        sql`${anchor_game_promo_daily.date} <= ${filters.date_to}`,
      ),
    )
    .groupBy(anchor_game_promo_daily.anchor_id);

  const mgMap = new Map(mgIncomes.map((r) => [r.anchor_id, Number(r.sum_income)]));
  const gameMap = new Map(gameIncomes.map((r) => [r.anchor_id, Number(r.sum_income)]));

  const num = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return rows.map((r) => ({
    anchor_id: r.anchor_id,
    nick_name: r.nick_name,
    is_threekingdoms: r.is_threekingdoms,
    broker_name: r.broker_name,
    recruit_broker_name: r.recruit_broker_name,
    anchor_health_score: r.anchor_health_score,
    total_fans: num(r.total_fans),

    total_fan_ticket: num(r.total_fan_ticket),
    live_fan_ticket_no_guest: num(r.live_fan_ticket_no_guest),
    property_fan_ticket_no_guest: num(r.property_fan_ticket_no_guest),
    guest_fan_ticket: num(r.guest_fan_ticket),
    activity_fan_ticket_no_guest: num(r.activity_fan_ticket_no_guest),
    special_fan_ticket: num(r.special_fan_ticket),
    subscribe_fan_ticket: num(r.subscribe_fan_ticket),
    star_guard_earn_score: num(r.star_guard_earn_score),

    live_duration: num(r.live_duration),
    valid_live_duration: num(r.valid_live_duration),
    live_days: num(r.live_days),
    solo_valid_days: num(r.solo_valid_days),
    new_follow_fans: num(r.new_follow_fans),
    peak_per_minute_ucnt: num(r.peak_per_minute_ucnt),
    feed_acu: num(r.feed_acu),
    feed_watch_duration: num(r.feed_watch_duration),

    video_view_count: num(r.video_view_count),
    video_like_count: num(r.video_like_count),
    video_comment_count: num(r.video_comment_count),

    minigame_income: mgMap.get(r.anchor_id) ?? null,
    game_income: gameMap.get(r.anchor_id) ?? null,
  }));
}
