import "server-only";
import { db } from "@/db/client";
import {
  anchor_profile,
  anchor_daily,
  anchor_minigame_daily,
  anchor_game_promo_daily,
  anchor_portrait_daily,
  broker_user_mapping,
  dingtalk_user,
} from "@/db/schema";
import { and, eq, sql, inArray, gte, like, or } from "drizzle-orm";
import { resolvePermission } from "@/modules/permissions/server";
import { getManagedDeptIds } from "@/modules/permissions/server";
import type { AnchorListFilters, AnchorListRow } from "./types";

/**
 * 按用户权限过滤的主播明细查询（全字段版）。
 *
 * 数据来源:
 *   anchor_profile             — 档案/签约/经纪人
 *   anchor_daily               — 音浪/时长/互动/视频 (日期范围 SUM)
 *   anchor_portrait_daily      — 曝光/进房/打赏 (日期范围 SUM/AVG)
 *   anchor_game_promo_daily    — 推广游戏 cps / cps_all (分别子查询)
 *   anchor_minigame_daily      — 小游戏 (日期范围 SUM)
 *
 * scope 过滤逻辑保持 Phase 1 逻辑不变。
 */
export async function listAnchors(
  userId: string,
  filters: AnchorListFilters,
): Promise<AnchorListRow[]> {
  const perm = await resolvePermission(userId);
  if (perm.scope === "none") return [];

  const where: ReturnType<typeof eq>[] = [];

  // ── scope 过滤 ─────────────────────────────────────────────────────────
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
    if (teamBrokers.length === 0) return [];
    where.push(
      inArray(
        anchor_profile.broker_id,
        teamBrokers.map((m) => m.broker_id),
      ),
    );
  }

  // ── 业务筛 ─────────────────────────────────────────────────────────────
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

  // ── 日期范围条件 ───────────────────────────────────────────────────────
  const dailyRange = and(
    sql`${anchor_daily.date} >= ${filters.date_from}`,
    sql`${anchor_daily.date} <= ${filters.date_to}`,
  );
  const portraitRange = and(
    sql`${anchor_portrait_daily.date} >= ${filters.date_from}`,
    sql`${anchor_portrait_daily.date} <= ${filters.date_to}`,
  );

  // archived 主播只在所选日期范围内有数据时才显示（PRO3 历史迁来的离场主播）
  // active 主播永远显示（即使当天没数据，也会列出 0 值）
  where.push(
    sql`(
      ${anchor_profile.is_archived} = FALSE
      OR ${anchor_profile.anchor_id} IN (
        SELECT anchor_id FROM ${anchor_daily}
          WHERE date >= ${filters.date_from} AND date <= ${filters.date_to}
        UNION
        SELECT anchor_id FROM ${anchor_game_promo_daily}
          WHERE date >= ${filters.date_from} AND date <= ${filters.date_to}
        UNION
        SELECT anchor_id FROM ${anchor_minigame_daily}
          WHERE date >= ${filters.date_from} AND date <= ${filters.date_to}
      )
    )`,
  );

  // ── 主查询: 仅 anchor_profile（去掉 daily/portrait inline join 防笛卡尔积） ──
  const profileRows = await db
    .select({
      anchor_id: anchor_profile.anchor_id,
      nick_name: anchor_profile.nick_name,
      is_threekingdoms: anchor_profile.is_threekingdoms,
      avatar: anchor_profile.avatar,
      aweme_display_id: anchor_profile.aweme_display_id,
      aweme_short_id: anchor_profile.aweme_short_id,
      hotsoon_display_id: anchor_profile.hotsoon_display_id,
      anchor_health_score: anchor_profile.anchor_health_score,
      last_live_time: anchor_profile.last_live_time,
      broker_name: anchor_profile.broker_name,
      recruit_broker_name: anchor_profile.recruit_broker_name,
      signing_time: anchor_profile.signing_time,
      sign_start_time: anchor_profile.sign_start_time,
      sign_end_time: anchor_profile.sign_end_time,
      union_member_end_date: anchor_profile.union_member_end_date,
      auto_renewal: anchor_profile.auto_renewal,
      join_time: anchor_profile.join_time,
      first_live_time_in_faction: anchor_profile.first_live_time_in_faction,
      wait_for_leave: anchor_profile.wait_for_leave,
      income_percent: anchor_profile.income_percent,
    })
    .from(anchor_profile)
    .where(where.length > 0 ? and(...where) : undefined);

  const anchorIds = profileRows.map((r) => r.anchor_id);
  if (anchorIds.length === 0) return [];

  // ── 子查询: anchor_daily 聚合（先 GROUP BY anchor_id, 避免与 portrait join 笛卡尔积） ──
  const dailyAgg = await db
    .select({
      anchor_id: anchor_daily.anchor_id,
      total_fan_ticket: sql<string>`COALESCE(SUM(${anchor_daily.total_fan_ticket}), 0)`,
      live_fan_ticket_no_guest: sql<string>`COALESCE(SUM(${anchor_daily.live_fan_ticket_no_guest}), 0)`,
      property_fan_ticket_no_guest: sql<string>`COALESCE(SUM(${anchor_daily.property_fan_ticket_no_guest}), 0)`,
      guest_fan_ticket: sql<string>`COALESCE(SUM(${anchor_daily.guest_fan_ticket}), 0)`,
      subscribe_fan_ticket: sql<string>`COALESCE(SUM(${anchor_daily.subscribe_fan_ticket}), 0)`,
      pk_fan_ticket: sql<string>`COALESCE(SUM(${anchor_daily.pk_fan_ticket}), 0)`,
      star_guard_earn_score: sql<string>`COALESCE(SUM(${anchor_daily.star_guard_earn_score}), 0)`,
      stat_guard_enter_account_earn_score: sql<string>`COALESCE(SUM(${anchor_daily.stat_guard_enter_account_earn_score}), 0)`,
      live_duration: sql<string>`COALESCE(SUM(${anchor_daily.live_duration_1d}), 0)`,
      valid_live_duration: sql<string>`COALESCE(SUM(${anchor_daily.valid_live_duration_1d}), 0)`,
      feed_watch_duration: sql<string>`COALESCE(SUM(${anchor_daily.feed_watch_duration_1d}), 0)`,
      live_days: sql<number>`COUNT(*) FILTER (WHERE ${anchor_daily.live_duration_1d} > 0)`,
      solo_valid_days: sql<number>`COALESCE(SUM(${anchor_daily.is_solo_valid_day}), 0)`,
      total_fans: sql<number>`COALESCE(MAX(${anchor_daily.total_fans}), 0)`,
      new_follow_fans: sql<number>`COALESCE(SUM(${anchor_daily.new_follow_fans_1d}), 0)`,
      peak_per_minute_ucnt: sql<number>`COALESCE(MAX(${anchor_daily.peak_per_minute_ucnt}), 0)`,
      feed_acu: sql<number>`COALESCE(MAX(${anchor_daily.feed_acu}), 0)`,
      current_percent: sql<string>`COALESCE(MAX(${anchor_daily.current_percent}), 0)`,
      profit_share_ratio: sql<string>`COALESCE(MAX(${anchor_daily.profit_share_ratio}), 0)`,
      video_view_count: sql<number>`COALESCE(SUM(${anchor_daily.video_view_count}), 0)`,
      video_like_count: sql<number>`COALESCE(SUM(${anchor_daily.video_like_count}), 0)`,
      video_comment_count: sql<number>`COALESCE(SUM(${anchor_daily.video_comment_count}), 0)`,
    })
    .from(anchor_daily)
    .where(and(inArray(anchor_daily.anchor_id, anchorIds), dailyRange))
    .groupBy(anchor_daily.anchor_id);

  // ── 子查询: anchor_portrait_daily 聚合 ──
  const portraitAgg = await db
    .select({
      anchor_id: anchor_portrait_daily.anchor_id,
      show_uv: sql<number>`COALESCE(SUM(${anchor_portrait_daily.show_uv}), 0)`,
      show_cnt: sql<number>`COALESCE(SUM(${anchor_portrait_daily.show_cnt}), 0)`,
      watch_uv: sql<number>`COALESCE(SUM(${anchor_portrait_daily.watch_uv}), 0)`,
      watch_cnt: sql<number>`COALESCE(SUM(${anchor_portrait_daily.watch_cnt}), 0)`,
      enter_room_rate: sql<string>`COALESCE(AVG(${anchor_portrait_daily.enter_room_rate}), 0)`,
      avg_watch_duration: sql<string>`COALESCE(AVG(${anchor_portrait_daily.avg_watch_duration}), 0)`,
      consume_uv: sql<number>`COALESCE(SUM(${anchor_portrait_daily.consume_uv}), 0)`,
      consume_cnt: sql<number>`COALESCE(SUM(${anchor_portrait_daily.consume_cnt}), 0)`,
      consume_rate: sql<string>`COALESCE(AVG(${anchor_portrait_daily.consume_rate}), 0)`,
    })
    .from(anchor_portrait_daily)
    .where(and(inArray(anchor_portrait_daily.anchor_id, anchorIds), portraitRange))
    .groupBy(anchor_portrait_daily.anchor_id);

  // 合成 rows = profile + dailyAgg + portraitAgg
  const dailyAggMap = new Map(dailyAgg.map((r) => [r.anchor_id, r]));
  const portraitAggMap = new Map(portraitAgg.map((r) => [r.anchor_id, r]));
  const rows = profileRows.map((p) => {
    const d = dailyAggMap.get(p.anchor_id);
    const pt = portraitAggMap.get(p.anchor_id);
    return {
      ...p,
      total_fan_ticket: d?.total_fan_ticket ?? "0",
      live_fan_ticket_no_guest: d?.live_fan_ticket_no_guest ?? "0",
      property_fan_ticket_no_guest: d?.property_fan_ticket_no_guest ?? "0",
      guest_fan_ticket: d?.guest_fan_ticket ?? "0",
      subscribe_fan_ticket: d?.subscribe_fan_ticket ?? "0",
      pk_fan_ticket: d?.pk_fan_ticket ?? "0",
      star_guard_earn_score: d?.star_guard_earn_score ?? "0",
      stat_guard_enter_account_earn_score: d?.stat_guard_enter_account_earn_score ?? "0",
      live_duration: d?.live_duration ?? "0",
      valid_live_duration: d?.valid_live_duration ?? "0",
      feed_watch_duration: d?.feed_watch_duration ?? "0",
      live_days: d?.live_days ?? 0,
      solo_valid_days: d?.solo_valid_days ?? 0,
      total_fans: d?.total_fans ?? 0,
      new_follow_fans: d?.new_follow_fans ?? 0,
      peak_per_minute_ucnt: d?.peak_per_minute_ucnt ?? 0,
      feed_acu: d?.feed_acu ?? 0,
      current_percent: d?.current_percent ?? "0",
      profit_share_ratio: d?.profit_share_ratio ?? "0",
      video_view_count: d?.video_view_count ?? 0,
      video_like_count: d?.video_like_count ?? 0,
      video_comment_count: d?.video_comment_count ?? 0,
      show_uv: pt?.show_uv ?? 0,
      show_cnt: pt?.show_cnt ?? 0,
      watch_uv: pt?.watch_uv ?? 0,
      watch_cnt: pt?.watch_cnt ?? 0,
      enter_room_rate: pt?.enter_room_rate ?? "0",
      avg_watch_duration: pt?.avg_watch_duration ?? "0",
      consume_uv: pt?.consume_uv ?? 0,
      consume_cnt: pt?.consume_cnt ?? 0,
      consume_rate: pt?.consume_rate ?? "0",
    };
  });
  // 按总音浪降序排（profile-only 主查询无法 SQL 端排序）
  rows.sort((a, b) => Number(b.total_fan_ticket) - Number(a.total_fan_ticket));
  if (rows.length > 5000) rows.length = 5000;

  // ── 子查询: game_promo live + cps（直播流水分成） ─────────────────────
  const gameCps = await db
    .select({
      anchor_id: anchor_game_promo_daily.anchor_id,
      g_live_cnt: sql<number>`SUM(${anchor_game_promo_daily.promote_live_cnt_1d})`,
      g_live_duration: sql<string>`SUM(${anchor_game_promo_daily.promote_live_duration_1d})`,
      g_live_duration_avg: sql<string>`COALESCE(AVG(${anchor_game_promo_daily.promote_live_duration_avg}), 0)`,
      g_watch_ucnt: sql<number>`SUM(${anchor_game_promo_daily.promote_live_watch_ucnt_1d})`,
      g_watch_duration: sql<string>`SUM(${anchor_game_promo_daily.promote_live_watch_duration_1d})`,
      g_watch_duration_uavg: sql<string>`COALESCE(AVG(${anchor_game_promo_daily.promote_live_watch_duration_uavg_1d}), 0)`,
      g_acu: sql<number>`COALESCE(MAX(${anchor_game_promo_daily.acu}), 0)`,
      g_pcu: sql<number>`COALESCE(MAX(${anchor_game_promo_daily.pcu}), 0)`,
      g_like_ucnt: sql<number>`SUM(${anchor_game_promo_daily.promote_live_like_ucnt_1d})`,
      g_comment_ucnt: sql<number>`SUM(${anchor_game_promo_daily.promote_live_comment_ucnt_1d})`,
      g_follow_ucnt: sql<number>`SUM(${anchor_game_promo_daily.promote_live_follow_ucnt_1d})`,
      g_like_uavg: sql<string>`COALESCE(AVG(${anchor_game_promo_daily.promote_live_like_uavg_1d}), 0)`,
      g_comment_uavg: sql<string>`COALESCE(AVG(${anchor_game_promo_daily.promote_live_comment_uavg_1d}), 0)`,
      g_follow_uavg: sql<string>`COALESCE(AVG(${anchor_game_promo_daily.promote_live_follow_uavg_1d}), 0)`,
      g_click_download: sql<number>`SUM(${anchor_game_promo_daily.promote_click_download_ucnt_1d})`,
      g_start_download: sql<number>`SUM(${anchor_game_promo_daily.promote_start_download_ucnt_1d})`,
      g_download_finish: sql<number>`SUM(${anchor_game_promo_daily.promote_download_finish_ucnt_1d})`,
      g_install_finish: sql<number>`SUM(${anchor_game_promo_daily.promote_install_finish_ucnt_1d})`,
      g_active_ucnt: sql<number>`SUM(${anchor_game_promo_daily.promote_active_ucnt_1d})`,
      g_pay_ucnt: sql<number>`SUM(${anchor_game_promo_daily.promote_pay_ucnt_1d})`,
      g_pay_amount: sql<number>`SUM(${anchor_game_promo_daily.promote_pay_amount_1d})`,
      g_props_pay_amount: sql<number>`SUM(${anchor_game_promo_daily.props_pay_amount_1d})`,
      g_props_anchor_amount: sql<number>`SUM(${anchor_game_promo_daily.props_anchor_pay_amount_1d})`,
      g_props_faction_amount: sql<number>`SUM(${anchor_game_promo_daily.props_faction_pay_amount_1d})`,
      g_anchor_income: sql<number>`SUM(${anchor_game_promo_daily.promote_anchor_income_1d})`,
      g_faction_income: sql<number>`SUM(${anchor_game_promo_daily.promote_faction_income_1d})`,
    })
    .from(anchor_game_promo_daily)
    .where(
      and(
        inArray(anchor_game_promo_daily.anchor_id, anchorIds),
        eq(anchor_game_promo_daily.biz_mode, "cps"),
        eq(anchor_game_promo_daily.promote_scene, "live"),
        sql`${anchor_game_promo_daily.date} >= ${filters.date_from}`,
        sql`${anchor_game_promo_daily.date} <= ${filters.date_to}`,
      ),
    )
    .groupBy(anchor_game_promo_daily.anchor_id);

  // ── 子查询: game_promo live + cps_all（直播促活分成） ──────────────────
  const gameCpsAll = await db
    .select({
      anchor_id: anchor_game_promo_daily.anchor_id,
      g_download_pay_ucnt: sql<number>`SUM(${anchor_game_promo_daily.promote_download_pay_ucnt_1d})`,
      g_download_pay_amount: sql<number>`SUM(${anchor_game_promo_daily.promote_download_pay_amount_1d})`,
      g_anchor_download_pay: sql<number>`SUM(${anchor_game_promo_daily.promote_anchor_download_pay_amount_1d})`,
      g_faction_download_pay: sql<number>`SUM(${anchor_game_promo_daily.promote_faction_download_pay_amount_1d})`,
      g_active_pay_ucnt: sql<number>`SUM(${anchor_game_promo_daily.promote_active_pay_ucnt_1d})`,
      g_anchor_active_pay: sql<number>`SUM(${anchor_game_promo_daily.promote_anchor_active_pay_amount_1d})`,
      g_faction_active_pay: sql<number>`SUM(${anchor_game_promo_daily.promote_faction_active_pay_amount_1d})`,
    })
    .from(anchor_game_promo_daily)
    .where(
      and(
        inArray(anchor_game_promo_daily.anchor_id, anchorIds),
        eq(anchor_game_promo_daily.biz_mode, "cps_all"),
        eq(anchor_game_promo_daily.promote_scene, "live"),
        sql`${anchor_game_promo_daily.date} >= ${filters.date_from}`,
        sql`${anchor_game_promo_daily.date} <= ${filters.date_to}`,
      ),
    )
    .groupBy(anchor_game_promo_daily.anchor_id);

  // ── 子查询: game_promo video + cps（短视频流水分成） ───────────────────
  const videoCps = await db
    .select({
      anchor_id: anchor_game_promo_daily.anchor_id,
      v_publish_cnt: sql<number>`SUM(${anchor_game_promo_daily.promote_video_publish_cnt_1d})`,
      v_vv: sql<number>`SUM(${anchor_game_promo_daily.promote_item_vv_1d})`,
      v_uv: sql<number>`SUM(${anchor_game_promo_daily.promote_item_uv_1d})`,
      v_uavg: sql<string>`COALESCE(AVG(${anchor_game_promo_daily.promote_item_uavg_1d}), 0)`,
      v_finish_play_ucnt: sql<number>`SUM(${anchor_game_promo_daily.promote_finish_play_ucnt_1d})`,
      v_finish_play_ratio: sql<string>`COALESCE(AVG(${anchor_game_promo_daily.promote_finish_play_ratio_1d}), 0)`,
      v_like_ucnt: sql<number>`SUM(${anchor_game_promo_daily.promote_live_like_ucnt_1d})`,
      v_follow_ucnt: sql<number>`SUM(${anchor_game_promo_daily.promote_live_follow_ucnt_1d})`,
      v_comment_ucnt: sql<number>`SUM(${anchor_game_promo_daily.promote_live_comment_ucnt_1d})`,
      v_like_uavg: sql<string>`COALESCE(AVG(${anchor_game_promo_daily.promote_live_like_uavg_1d}), 0)`,
      v_follow_uavg: sql<string>`COALESCE(AVG(${anchor_game_promo_daily.promote_live_follow_uavg_1d}), 0)`,
      v_comment_uavg: sql<string>`COALESCE(AVG(${anchor_game_promo_daily.promote_live_comment_uavg_1d}), 0)`,
      v_click_download: sql<number>`SUM(${anchor_game_promo_daily.promote_click_download_ucnt_1d})`,
      v_start_download: sql<number>`SUM(${anchor_game_promo_daily.promote_start_download_ucnt_1d})`,
      v_download_finish: sql<number>`SUM(${anchor_game_promo_daily.promote_download_finish_ucnt_1d})`,
      v_install_finish: sql<number>`SUM(${anchor_game_promo_daily.promote_install_finish_ucnt_1d})`,
      v_active_ucnt: sql<number>`SUM(${anchor_game_promo_daily.promote_active_ucnt_1d})`,
      v_charge_pay_ucnt: sql<number>`SUM(${anchor_game_promo_daily.promote_charge_pay_ucnt_1d})`,
      v_pay_amount: sql<number>`SUM(${anchor_game_promo_daily.promote_pay_amount_1d})`,
      v_anchor_income: sql<number>`SUM(${anchor_game_promo_daily.promote_anchor_income_1d})`,
      v_faction_income: sql<number>`SUM(${anchor_game_promo_daily.promote_faction_income_1d})`,
    })
    .from(anchor_game_promo_daily)
    .where(
      and(
        inArray(anchor_game_promo_daily.anchor_id, anchorIds),
        eq(anchor_game_promo_daily.biz_mode, "cps"),
        eq(anchor_game_promo_daily.promote_scene, "video"),
        sql`${anchor_game_promo_daily.date} >= ${filters.date_from}`,
        sql`${anchor_game_promo_daily.date} <= ${filters.date_to}`,
      ),
    )
    .groupBy(anchor_game_promo_daily.anchor_id);

  // ── 子查询: game_promo video + cps_all（短视频促活分成） ───────────────
  const videoCpsAll = await db
    .select({
      anchor_id: anchor_game_promo_daily.anchor_id,
      v_download_pay_ucnt: sql<number>`SUM(${anchor_game_promo_daily.promote_download_pay_ucnt_1d})`,
      v_download_pay_amount: sql<number>`SUM(${anchor_game_promo_daily.promote_download_pay_amount_1d})`,
      v_anchor_download_pay: sql<number>`SUM(${anchor_game_promo_daily.promote_anchor_download_pay_amount_1d})`,
      v_faction_download_pay: sql<number>`SUM(${anchor_game_promo_daily.promote_faction_download_pay_amount_1d})`,
      v_active_pay_ucnt: sql<number>`SUM(${anchor_game_promo_daily.promote_active_pay_ucnt_1d})`,
      v_anchor_active_pay: sql<number>`SUM(${anchor_game_promo_daily.promote_anchor_active_pay_amount_1d})`,
      v_faction_active_pay: sql<number>`SUM(${anchor_game_promo_daily.promote_faction_active_pay_amount_1d})`,
    })
    .from(anchor_game_promo_daily)
    .where(
      and(
        inArray(anchor_game_promo_daily.anchor_id, anchorIds),
        eq(anchor_game_promo_daily.biz_mode, "cps_all"),
        eq(anchor_game_promo_daily.promote_scene, "video"),
        sql`${anchor_game_promo_daily.date} >= ${filters.date_from}`,
        sql`${anchor_game_promo_daily.date} <= ${filters.date_to}`,
      ),
    )
    .groupBy(anchor_game_promo_daily.anchor_id);

  // ── 子查询: minigame ────────────────────────────────────────────────────
  const mgRows = await db
    .select({
      anchor_id: anchor_minigame_daily.anchor_id,
      mg_room_cnt: sql<number>`SUM(${anchor_minigame_daily.live_room_cnt})`,
      mg_duration: sql<string>`SUM(${anchor_minigame_daily.live_duration})`,
      mg_avg_room_live_duration: sql<string>`COALESCE(AVG(${anchor_minigame_daily.avg_room_live_duration}), 0)`,
      mg_watch_ucnt: sql<number>`SUM(${anchor_minigame_daily.watch_ucnt})`,
      mg_watch_duration: sql<string>`SUM(${anchor_minigame_daily.watch_duration})`,
      mg_avg_user_watch_duration: sql<string>`COALESCE(AVG(${anchor_minigame_daily.avg_user_watch_duration}), 0)`,
      mg_acu: sql<number>`COALESCE(MAX(${anchor_minigame_daily.acu}), 0)`,
      mg_pcu: sql<number>`COALESCE(MAX(${anchor_minigame_daily.pcu}), 0)`,
      mg_like_ucnt: sql<number>`SUM(${anchor_minigame_daily.like_ucnt})`,
      mg_follow_ucnt: sql<number>`SUM(${anchor_minigame_daily.follow_ucnt})`,
      mg_comment_ucnt: sql<number>`SUM(${anchor_minigame_daily.comment_ucnt})`,
      mg_like_ratio: sql<string>`COALESCE(AVG(${anchor_minigame_daily.like_ucnt_ratio}), 0)`,
      mg_follow_ratio: sql<string>`COALESCE(AVG(${anchor_minigame_daily.follow_ucnt_ratio}), 0)`,
      mg_comment_ratio: sql<string>`COALESCE(AVG(${anchor_minigame_daily.comment_ucnt_ratio}), 0)`,
      mg_click_ucnt: sql<number>`SUM(${anchor_minigame_daily.gm_click_ucnt})`,
      mg_active_ucnt: sql<number>`SUM(${anchor_minigame_daily.gm_active_ucnt})`,
      mg_pay_ucnt: sql<number>`SUM(${anchor_minigame_daily.gm_pay_ucnt})`,
      mg_before_income: sql<number>`SUM(${anchor_minigame_daily.before_divided_income})`,
      mg_anchor_income: sql<number>`SUM(${anchor_minigame_daily.after_divided_author_income})`,
      mg_union_income: sql<number>`SUM(${anchor_minigame_daily.after_divided_trade_union_income})`,
      mg_cps_bind: sql<number>`SUM(${anchor_minigame_daily.cps_bind_uv})`,
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

  // ── 构建 Maps ──────────────────────────────────────────────────────────
  const gameCpsMap = new Map(gameCps.map((r) => [r.anchor_id, r]));
  const gameCpsAllMap = new Map(gameCpsAll.map((r) => [r.anchor_id, r]));
  const videoCpsMap = new Map(videoCps.map((r) => [r.anchor_id, r]));
  const videoCpsAllMap = new Map(videoCpsAll.map((r) => [r.anchor_id, r]));
  const mgMap = new Map(mgRows.map((r) => [r.anchor_id, r]));

  const num = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const numOrNull = (v: unknown): number | null => {
    const n = num(v);
    return n === 0 ? null : n;
  };

  return rows.map((r) => {
    const gc = gameCpsMap.get(r.anchor_id);
    const ga = gameCpsAllMap.get(r.anchor_id);
    const vc = videoCpsMap.get(r.anchor_id);
    const va = videoCpsAllMap.get(r.anchor_id);
    const mg = mgMap.get(r.anchor_id);

    return {
      // 档案
      anchor_id: r.anchor_id,
      nick_name: r.nick_name,
      is_threekingdoms: r.is_threekingdoms,
      avatar: r.avatar,
      aweme_display_id: r.aweme_display_id,
      aweme_short_id: r.aweme_short_id,
      hotsoon_display_id: r.hotsoon_display_id,
      anchor_health_score: r.anchor_health_score,
      last_live_time: r.last_live_time,

      // 签约
      broker_name: r.broker_name,
      recruit_broker_name: r.recruit_broker_name,
      signing_time: r.signing_time,
      sign_start_time: r.sign_start_time,
      sign_end_time: r.sign_end_time,
      union_member_end_date: r.union_member_end_date,
      auto_renewal: r.auto_renewal,
      join_time: r.join_time,
      first_live_time_in_faction: r.first_live_time_in_faction,
      wait_for_leave: r.wait_for_leave,
      income_percent: num(r.income_percent),

      // 音浪
      total_fan_ticket: num(r.total_fan_ticket),
      live_fan_ticket_no_guest: num(r.live_fan_ticket_no_guest),
      property_fan_ticket_no_guest: num(r.property_fan_ticket_no_guest),
      guest_fan_ticket: num(r.guest_fan_ticket),
      subscribe_fan_ticket: num(r.subscribe_fan_ticket),
      pk_fan_ticket: num(r.pk_fan_ticket),
      star_guard_earn_score: num(r.star_guard_earn_score),
      stat_guard_enter_account_earn_score: num(r.stat_guard_enter_account_earn_score),

      // 时长
      live_duration: num(r.live_duration),
      valid_live_duration: num(r.valid_live_duration),
      feed_watch_duration: num(r.feed_watch_duration),
      live_days: num(r.live_days),
      solo_valid_days: num(r.solo_valid_days),

      // 互动
      total_fans: num(r.total_fans),
      new_follow_fans: num(r.new_follow_fans),
      peak_per_minute_ucnt: num(r.peak_per_minute_ucnt),
      feed_acu: num(r.feed_acu),
      current_percent: num(r.current_percent),
      profit_share_ratio: num(r.profit_share_ratio),

      // 视频
      video_view_count: num(r.video_view_count),
      video_like_count: num(r.video_like_count),
      video_comment_count: num(r.video_comment_count),

      // portrait
      show_uv: num(r.show_uv),
      show_cnt: num(r.show_cnt),
      watch_uv: num(r.watch_uv),
      watch_cnt: num(r.watch_cnt),
      enter_room_rate: num(r.enter_room_rate),
      avg_watch_duration: num(r.avg_watch_duration),
      consume_uv: num(r.consume_uv),
      consume_cnt: num(r.consume_cnt),
      consume_rate: num(r.consume_rate),

      // game cps
      g_live_cnt: gc ? num(gc.g_live_cnt) : null,
      g_live_duration: gc ? num(gc.g_live_duration) : null,
      g_live_duration_avg: gc ? num(gc.g_live_duration_avg) : null,
      g_watch_ucnt: gc ? num(gc.g_watch_ucnt) : null,
      g_watch_duration: gc ? num(gc.g_watch_duration) : null,
      g_watch_duration_uavg: gc ? num(gc.g_watch_duration_uavg) : null,
      g_acu: gc ? num(gc.g_acu) : null,
      g_pcu: gc ? num(gc.g_pcu) : null,
      g_like_ucnt: gc ? num(gc.g_like_ucnt) : null,
      g_comment_ucnt: gc ? num(gc.g_comment_ucnt) : null,
      g_follow_ucnt: gc ? num(gc.g_follow_ucnt) : null,
      g_like_uavg: gc ? num(gc.g_like_uavg) : null,
      g_comment_uavg: gc ? num(gc.g_comment_uavg) : null,
      g_follow_uavg: gc ? num(gc.g_follow_uavg) : null,
      g_click_download: gc ? num(gc.g_click_download) : null,
      g_start_download: gc ? num(gc.g_start_download) : null,
      g_download_finish: gc ? num(gc.g_download_finish) : null,
      g_install_finish: gc ? num(gc.g_install_finish) : null,
      g_active_ucnt: gc ? num(gc.g_active_ucnt) : null,
      g_pay_ucnt: gc ? num(gc.g_pay_ucnt) : null,
      g_pay_amount: gc ? num(gc.g_pay_amount) : null,
      g_props_pay_amount: gc ? num(gc.g_props_pay_amount) : null,
      g_props_anchor_amount: gc ? num(gc.g_props_anchor_amount) : null,
      g_props_faction_amount: gc ? num(gc.g_props_faction_amount) : null,
      g_anchor_income: gc ? num(gc.g_anchor_income) : null,
      g_faction_income: gc ? num(gc.g_faction_income) : null,

      // game cps_all (live)
      g_download_pay_ucnt: ga ? num(ga.g_download_pay_ucnt) : null,
      g_download_pay_amount: ga ? num(ga.g_download_pay_amount) : null,
      g_anchor_download_pay: ga ? num(ga.g_anchor_download_pay) : null,
      g_faction_download_pay: ga ? num(ga.g_faction_download_pay) : null,
      g_active_pay_ucnt: ga ? num(ga.g_active_pay_ucnt) : null,
      g_anchor_active_pay: ga ? num(ga.g_anchor_active_pay) : null,
      g_faction_active_pay: ga ? num(ga.g_faction_active_pay) : null,

      // 计算字段：促活流水 = (主播+机构 active_pay) / 0.4；当日流水 = 促活流水 + 下载充值流水
      g_promote_active_amount: (() => {
        const a = ga ? num(ga.g_anchor_active_pay) : null;
        const f = ga ? num(ga.g_faction_active_pay) : null;
        if (a === null && f === null) return null;
        return ((a ?? 0) + (f ?? 0)) / 0.4;
      })(),
      g_total_amount: (() => {
        const a = ga ? num(ga.g_anchor_active_pay) : null;
        const f = ga ? num(ga.g_faction_active_pay) : null;
        const d = ga ? num(ga.g_download_pay_amount) : null;
        if (a === null && f === null && d === null) return null;
        return ((a ?? 0) + (f ?? 0)) / 0.4 + (d ?? 0);
      })(),

      // video cps（短视频流水分成）
      v_publish_cnt: vc ? num(vc.v_publish_cnt) : null,
      v_vv: vc ? num(vc.v_vv) : null,
      v_uv: vc ? num(vc.v_uv) : null,
      v_uavg: vc ? num(vc.v_uavg) : null,
      v_finish_play_ucnt: vc ? num(vc.v_finish_play_ucnt) : null,
      v_finish_play_ratio: vc ? num(vc.v_finish_play_ratio) : null,
      v_like_ucnt: vc ? num(vc.v_like_ucnt) : null,
      v_follow_ucnt: vc ? num(vc.v_follow_ucnt) : null,
      v_comment_ucnt: vc ? num(vc.v_comment_ucnt) : null,
      v_like_uavg: vc ? num(vc.v_like_uavg) : null,
      v_follow_uavg: vc ? num(vc.v_follow_uavg) : null,
      v_comment_uavg: vc ? num(vc.v_comment_uavg) : null,
      v_click_download: vc ? num(vc.v_click_download) : null,
      v_start_download: vc ? num(vc.v_start_download) : null,
      v_download_finish: vc ? num(vc.v_download_finish) : null,
      v_install_finish: vc ? num(vc.v_install_finish) : null,
      v_active_ucnt: vc ? num(vc.v_active_ucnt) : null,
      v_charge_pay_ucnt: vc ? num(vc.v_charge_pay_ucnt) : null,
      v_pay_amount: vc ? num(vc.v_pay_amount) : null,
      v_anchor_income: vc ? num(vc.v_anchor_income) : null,
      v_faction_income: vc ? num(vc.v_faction_income) : null,

      // video cps_all（短视频促活分成）
      v_download_pay_ucnt: va ? num(va.v_download_pay_ucnt) : null,
      v_download_pay_amount: va ? num(va.v_download_pay_amount) : null,
      v_anchor_download_pay: va ? num(va.v_anchor_download_pay) : null,
      v_faction_download_pay: va ? num(va.v_faction_download_pay) : null,
      v_active_pay_ucnt: va ? num(va.v_active_pay_ucnt) : null,
      v_anchor_active_pay: va ? num(va.v_anchor_active_pay) : null,
      v_faction_active_pay: va ? num(va.v_faction_active_pay) : null,

      // 计算字段：短视频促活流水 = (创作者+机构 active_pay) / 0.4；短视频当日流水 = 促活流水 + 下载充值流水
      v_promote_active_amount: (() => {
        const a = va ? num(va.v_anchor_active_pay) : null;
        const f = va ? num(va.v_faction_active_pay) : null;
        if (a === null && f === null) return null;
        return ((a ?? 0) + (f ?? 0)) / 0.4;
      })(),
      v_total_amount: (() => {
        const a = va ? num(va.v_anchor_active_pay) : null;
        const f = va ? num(va.v_faction_active_pay) : null;
        const d = va ? num(va.v_download_pay_amount) : null;
        if (a === null && f === null && d === null) return null;
        return ((a ?? 0) + (f ?? 0)) / 0.4 + (d ?? 0);
      })(),

      // 小手柄流水（计算字段）= 直播当日流水 + 短视频当日流水
      controller_total_amount: (() => {
        const gA = ga ? num(ga.g_anchor_active_pay) : null;
        const gF = ga ? num(ga.g_faction_active_pay) : null;
        const gD = ga ? num(ga.g_download_pay_amount) : null;
        const vA = va ? num(va.v_anchor_active_pay) : null;
        const vF = va ? num(va.v_faction_active_pay) : null;
        const vD = va ? num(va.v_download_pay_amount) : null;
        if (gA === null && gF === null && gD === null && vA === null && vF === null && vD === null)
          return null;
        const gTotal = ((gA ?? 0) + (gF ?? 0)) / 0.4 + (gD ?? 0);
        const vTotal = ((vA ?? 0) + (vF ?? 0)) / 0.4 + (vD ?? 0);
        return gTotal + vTotal;
      })(),

      // minigame
      mg_room_cnt: mg ? num(mg.mg_room_cnt) : null,
      mg_duration: mg ? num(mg.mg_duration) : null,
      mg_avg_room_live_duration: mg ? num(mg.mg_avg_room_live_duration) : null,
      mg_watch_ucnt: mg ? num(mg.mg_watch_ucnt) : null,
      mg_watch_duration: mg ? num(mg.mg_watch_duration) : null,
      mg_avg_user_watch_duration: mg ? num(mg.mg_avg_user_watch_duration) : null,
      mg_acu: mg ? num(mg.mg_acu) : null,
      mg_pcu: mg ? num(mg.mg_pcu) : null,
      mg_like_ucnt: mg ? num(mg.mg_like_ucnt) : null,
      mg_follow_ucnt: mg ? num(mg.mg_follow_ucnt) : null,
      mg_comment_ucnt: mg ? num(mg.mg_comment_ucnt) : null,
      mg_like_ratio: mg ? num(mg.mg_like_ratio) : null,
      mg_follow_ratio: mg ? num(mg.mg_follow_ratio) : null,
      mg_comment_ratio: mg ? num(mg.mg_comment_ratio) : null,
      mg_click_ucnt: mg ? num(mg.mg_click_ucnt) : null,
      mg_active_ucnt: mg ? num(mg.mg_active_ucnt) : null,
      mg_pay_ucnt: mg ? num(mg.mg_pay_ucnt) : null,
      mg_before_income: mg ? num(mg.mg_before_income) : null,
      mg_anchor_income: mg ? num(mg.mg_anchor_income) : null,
      mg_union_income: mg ? num(mg.mg_union_income) : null,
      mg_cps_bind: mg ? num(mg.mg_cps_bind) : null,

      // 小游戏流水（计算字段）：当前 = 直播-小游戏分成前；后续接入短视频-小游戏后求和
      minigame_total_amount: mg ? num(mg.mg_before_income) : null,

      // 旧兼容字段
      minigame_income: mg ? numOrNull(mg.mg_anchor_income) : null,
      game_income: gc ? numOrNull(gc.g_anchor_income) : null,
    };
  });
}
