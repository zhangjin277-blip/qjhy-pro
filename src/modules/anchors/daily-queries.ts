import "server-only";
import { db } from "@/db/client";
import {
  anchor_daily,
  anchor_game_promo_daily,
  anchor_minigame_daily,
  anchor_portrait_daily,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import type { AnchorDailyResponse, AnchorDailyRow } from "./types";

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const numOrNull = (v: unknown): number | null => {
  const n = num(v);
  return n === 0 ? null : n;
};

/** 计算同期对比的起止日期 */
function shiftDateRange(from: string, to: string): { from: string; to: string } {
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  const dayMs = 86_400_000;
  const lengthDays = Math.round((toMs - fromMs) / dayMs) + 1;
  const compareTo = new Date(fromMs - dayMs).toISOString().slice(0, 10);
  const compareFrom = new Date(fromMs - lengthDays * dayMs).toISOString().slice(0, 10);
  return { from: compareFrom, to: compareTo };
}

/**
 * 拉某主播在一段日期内的全字段日聚合（4 张日表合并），按日期升序返回。
 *
 * 字段集与 listAnchors 完全一致（除档案/签约/旧兼容），只是维度从 GROUP BY anchor_id
 * 改为 GROUP BY date。drawer 通过列表用户已选的列动态渲染，因此后端必须返回全字段。
 */
async function fetchDailyOnePeriod(
  anchorId: string,
  from: string,
  to: string,
): Promise<AnchorDailyRow[]> {
  // ── anchor_daily ────────────────────────────────────────────────────────
  const dailyAgg = await db
    .select({
      date: sql<string>`${anchor_daily.date}::text`,
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
    .where(
      and(
        eq(anchor_daily.anchor_id, anchorId),
        sql`${anchor_daily.date} >= ${from}`,
        sql`${anchor_daily.date} <= ${to}`,
      ),
    )
    .groupBy(anchor_daily.date);

  // ── portrait ────────────────────────────────────────────────────────────
  const portraitAgg = await db
    .select({
      date: sql<string>`${anchor_portrait_daily.date}::text`,
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
    .where(
      and(
        eq(anchor_portrait_daily.anchor_id, anchorId),
        sql`${anchor_portrait_daily.date} >= ${from}`,
        sql`${anchor_portrait_daily.date} <= ${to}`,
      ),
    )
    .groupBy(anchor_portrait_daily.date);

  // ── game_promo cps + live ───────────────────────────────────────────────
  const gameCps = await db
    .select({
      date: sql<string>`${anchor_game_promo_daily.date}::text`,
      g_live_cnt: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_live_cnt_1d}), 0)`,
      g_live_duration: sql<string>`COALESCE(SUM(${anchor_game_promo_daily.promote_live_duration_1d}), 0)`,
      g_live_duration_avg: sql<string>`COALESCE(AVG(${anchor_game_promo_daily.promote_live_duration_avg}), 0)`,
      g_watch_ucnt: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_live_watch_ucnt_1d}), 0)`,
      g_watch_duration: sql<string>`COALESCE(SUM(${anchor_game_promo_daily.promote_live_watch_duration_1d}), 0)`,
      g_watch_duration_uavg: sql<string>`COALESCE(AVG(${anchor_game_promo_daily.promote_live_watch_duration_uavg_1d}), 0)`,
      g_acu: sql<number>`COALESCE(MAX(${anchor_game_promo_daily.acu}), 0)`,
      g_pcu: sql<number>`COALESCE(MAX(${anchor_game_promo_daily.pcu}), 0)`,
      g_like_ucnt: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_live_like_ucnt_1d}), 0)`,
      g_comment_ucnt: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_live_comment_ucnt_1d}), 0)`,
      g_follow_ucnt: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_live_follow_ucnt_1d}), 0)`,
      g_like_uavg: sql<string>`COALESCE(AVG(${anchor_game_promo_daily.promote_live_like_uavg_1d}), 0)`,
      g_comment_uavg: sql<string>`COALESCE(AVG(${anchor_game_promo_daily.promote_live_comment_uavg_1d}), 0)`,
      g_follow_uavg: sql<string>`COALESCE(AVG(${anchor_game_promo_daily.promote_live_follow_uavg_1d}), 0)`,
      g_click_download: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_click_download_ucnt_1d}), 0)`,
      g_start_download: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_start_download_ucnt_1d}), 0)`,
      g_download_finish: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_download_finish_ucnt_1d}), 0)`,
      g_install_finish: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_install_finish_ucnt_1d}), 0)`,
      g_active_ucnt: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_active_ucnt_1d}), 0)`,
      g_pay_ucnt: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_pay_ucnt_1d}), 0)`,
      g_pay_amount: sql<string>`COALESCE(SUM(${anchor_game_promo_daily.promote_pay_amount_1d}), 0)`,
      g_props_pay_amount: sql<string>`COALESCE(SUM(${anchor_game_promo_daily.props_pay_amount_1d}), 0)`,
      g_props_anchor_amount: sql<string>`COALESCE(SUM(${anchor_game_promo_daily.props_anchor_pay_amount_1d}), 0)`,
      g_props_faction_amount: sql<string>`COALESCE(SUM(${anchor_game_promo_daily.props_faction_pay_amount_1d}), 0)`,
      g_anchor_income: sql<string>`COALESCE(SUM(${anchor_game_promo_daily.promote_anchor_income_1d}), 0)`,
      g_faction_income: sql<string>`COALESCE(SUM(${anchor_game_promo_daily.promote_faction_income_1d}), 0)`,
    })
    .from(anchor_game_promo_daily)
    .where(
      and(
        eq(anchor_game_promo_daily.anchor_id, anchorId),
        eq(anchor_game_promo_daily.biz_mode, "cps"),
        eq(anchor_game_promo_daily.promote_scene, "live"),
        sql`${anchor_game_promo_daily.date} >= ${from}`,
        sql`${anchor_game_promo_daily.date} <= ${to}`,
      ),
    )
    .groupBy(anchor_game_promo_daily.date);

  // ── game_promo cps_all + live ───────────────────────────────────────────
  const gameCpsAll = await db
    .select({
      date: sql<string>`${anchor_game_promo_daily.date}::text`,
      g_download_pay_ucnt: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_download_pay_ucnt_1d}), 0)`,
      g_download_pay_amount: sql<string>`COALESCE(SUM(${anchor_game_promo_daily.promote_download_pay_amount_1d}), 0)`,
      g_anchor_download_pay: sql<string>`COALESCE(SUM(${anchor_game_promo_daily.promote_anchor_download_pay_amount_1d}), 0)`,
      g_faction_download_pay: sql<string>`COALESCE(SUM(${anchor_game_promo_daily.promote_faction_download_pay_amount_1d}), 0)`,
      g_active_pay_ucnt: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_active_pay_ucnt_1d}), 0)`,
      g_anchor_active_pay: sql<string>`COALESCE(SUM(${anchor_game_promo_daily.promote_anchor_active_pay_amount_1d}), 0)`,
      g_faction_active_pay: sql<string>`COALESCE(SUM(${anchor_game_promo_daily.promote_faction_active_pay_amount_1d}), 0)`,
    })
    .from(anchor_game_promo_daily)
    .where(
      and(
        eq(anchor_game_promo_daily.anchor_id, anchorId),
        eq(anchor_game_promo_daily.biz_mode, "cps_all"),
        eq(anchor_game_promo_daily.promote_scene, "live"),
        sql`${anchor_game_promo_daily.date} >= ${from}`,
        sql`${anchor_game_promo_daily.date} <= ${to}`,
      ),
    )
    .groupBy(anchor_game_promo_daily.date);

  // ── game_promo cps + video（短视频流水分成）──────────────────────────────
  const videoCps = await db
    .select({
      date: sql<string>`${anchor_game_promo_daily.date}::text`,
      v_publish_cnt: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_video_publish_cnt_1d}), 0)`,
      v_vv: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_item_vv_1d}), 0)`,
      v_uv: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_item_uv_1d}), 0)`,
      v_uavg: sql<string>`COALESCE(AVG(${anchor_game_promo_daily.promote_item_uavg_1d}), 0)`,
      v_finish_play_ucnt: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_finish_play_ucnt_1d}), 0)`,
      v_finish_play_ratio: sql<string>`COALESCE(AVG(${anchor_game_promo_daily.promote_finish_play_ratio_1d}), 0)`,
      v_like_ucnt: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_live_like_ucnt_1d}), 0)`,
      v_follow_ucnt: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_live_follow_ucnt_1d}), 0)`,
      v_comment_ucnt: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_live_comment_ucnt_1d}), 0)`,
      v_like_uavg: sql<string>`COALESCE(AVG(${anchor_game_promo_daily.promote_live_like_uavg_1d}), 0)`,
      v_follow_uavg: sql<string>`COALESCE(AVG(${anchor_game_promo_daily.promote_live_follow_uavg_1d}), 0)`,
      v_comment_uavg: sql<string>`COALESCE(AVG(${anchor_game_promo_daily.promote_live_comment_uavg_1d}), 0)`,
      v_click_download: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_click_download_ucnt_1d}), 0)`,
      v_start_download: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_start_download_ucnt_1d}), 0)`,
      v_download_finish: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_download_finish_ucnt_1d}), 0)`,
      v_install_finish: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_install_finish_ucnt_1d}), 0)`,
      v_active_ucnt: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_active_ucnt_1d}), 0)`,
      v_charge_pay_ucnt: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_charge_pay_ucnt_1d}), 0)`,
      v_pay_amount: sql<string>`COALESCE(SUM(${anchor_game_promo_daily.promote_pay_amount_1d}), 0)`,
      v_anchor_income: sql<string>`COALESCE(SUM(${anchor_game_promo_daily.promote_anchor_income_1d}), 0)`,
      v_faction_income: sql<string>`COALESCE(SUM(${anchor_game_promo_daily.promote_faction_income_1d}), 0)`,
    })
    .from(anchor_game_promo_daily)
    .where(
      and(
        eq(anchor_game_promo_daily.anchor_id, anchorId),
        eq(anchor_game_promo_daily.biz_mode, "cps"),
        eq(anchor_game_promo_daily.promote_scene, "video"),
        sql`${anchor_game_promo_daily.date} >= ${from}`,
        sql`${anchor_game_promo_daily.date} <= ${to}`,
      ),
    )
    .groupBy(anchor_game_promo_daily.date);

  // ── game_promo cps_all + video（短视频促活分成）──────────────────────────
  const videoCpsAll = await db
    .select({
      date: sql<string>`${anchor_game_promo_daily.date}::text`,
      v_download_pay_ucnt: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_download_pay_ucnt_1d}), 0)`,
      v_download_pay_amount: sql<string>`COALESCE(SUM(${anchor_game_promo_daily.promote_download_pay_amount_1d}), 0)`,
      v_anchor_download_pay: sql<string>`COALESCE(SUM(${anchor_game_promo_daily.promote_anchor_download_pay_amount_1d}), 0)`,
      v_faction_download_pay: sql<string>`COALESCE(SUM(${anchor_game_promo_daily.promote_faction_download_pay_amount_1d}), 0)`,
      v_active_pay_ucnt: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_active_pay_ucnt_1d}), 0)`,
      v_anchor_active_pay: sql<string>`COALESCE(SUM(${anchor_game_promo_daily.promote_anchor_active_pay_amount_1d}), 0)`,
      v_faction_active_pay: sql<string>`COALESCE(SUM(${anchor_game_promo_daily.promote_faction_active_pay_amount_1d}), 0)`,
    })
    .from(anchor_game_promo_daily)
    .where(
      and(
        eq(anchor_game_promo_daily.anchor_id, anchorId),
        eq(anchor_game_promo_daily.biz_mode, "cps_all"),
        eq(anchor_game_promo_daily.promote_scene, "video"),
        sql`${anchor_game_promo_daily.date} >= ${from}`,
        sql`${anchor_game_promo_daily.date} <= ${to}`,
      ),
    )
    .groupBy(anchor_game_promo_daily.date);

  // ── minigame ────────────────────────────────────────────────────────────
  const mgAgg = await db
    .select({
      date: sql<string>`${anchor_minigame_daily.date}::text`,
      mg_room_cnt: sql<number>`COALESCE(SUM(${anchor_minigame_daily.live_room_cnt}), 0)`,
      mg_duration: sql<string>`COALESCE(SUM(${anchor_minigame_daily.live_duration}), 0)`,
      mg_avg_room_live_duration: sql<string>`COALESCE(AVG(${anchor_minigame_daily.avg_room_live_duration}), 0)`,
      mg_watch_ucnt: sql<number>`COALESCE(SUM(${anchor_minigame_daily.watch_ucnt}), 0)`,
      mg_watch_duration: sql<string>`COALESCE(SUM(${anchor_minigame_daily.watch_duration}), 0)`,
      mg_avg_user_watch_duration: sql<string>`COALESCE(AVG(${anchor_minigame_daily.avg_user_watch_duration}), 0)`,
      mg_acu: sql<number>`COALESCE(MAX(${anchor_minigame_daily.acu}), 0)`,
      mg_pcu: sql<number>`COALESCE(MAX(${anchor_minigame_daily.pcu}), 0)`,
      mg_like_ucnt: sql<number>`COALESCE(SUM(${anchor_minigame_daily.like_ucnt}), 0)`,
      mg_follow_ucnt: sql<number>`COALESCE(SUM(${anchor_minigame_daily.follow_ucnt}), 0)`,
      mg_comment_ucnt: sql<number>`COALESCE(SUM(${anchor_minigame_daily.comment_ucnt}), 0)`,
      mg_like_ratio: sql<string>`COALESCE(AVG(${anchor_minigame_daily.like_ucnt_ratio}), 0)`,
      mg_follow_ratio: sql<string>`COALESCE(AVG(${anchor_minigame_daily.follow_ucnt_ratio}), 0)`,
      mg_comment_ratio: sql<string>`COALESCE(AVG(${anchor_minigame_daily.comment_ucnt_ratio}), 0)`,
      mg_click_ucnt: sql<number>`COALESCE(SUM(${anchor_minigame_daily.gm_click_ucnt}), 0)`,
      mg_active_ucnt: sql<number>`COALESCE(SUM(${anchor_minigame_daily.gm_active_ucnt}), 0)`,
      mg_pay_ucnt: sql<number>`COALESCE(SUM(${anchor_minigame_daily.gm_pay_ucnt}), 0)`,
      mg_before_income: sql<string>`COALESCE(SUM(${anchor_minigame_daily.before_divided_income}), 0)`,
      mg_anchor_income: sql<string>`COALESCE(SUM(${anchor_minigame_daily.after_divided_author_income}), 0)`,
      mg_union_income: sql<string>`COALESCE(SUM(${anchor_minigame_daily.after_divided_trade_union_income}), 0)`,
      mg_cps_bind: sql<number>`COALESCE(SUM(${anchor_minigame_daily.cps_bind_uv}), 0)`,
    })
    .from(anchor_minigame_daily)
    .where(
      and(
        eq(anchor_minigame_daily.anchor_id, anchorId),
        sql`${anchor_minigame_daily.date} >= ${from}`,
        sql`${anchor_minigame_daily.date} <= ${to}`,
      ),
    )
    .groupBy(anchor_minigame_daily.date);

  // ── 按 date 合并 ────────────────────────────────────────────────────────
  const dailyMap = new Map(dailyAgg.map((r) => [r.date, r]));
  const portraitMap = new Map(portraitAgg.map((r) => [r.date, r]));
  const gameCpsMap = new Map(gameCps.map((r) => [r.date, r]));
  const gameCpsAllMap = new Map(gameCpsAll.map((r) => [r.date, r]));
  const videoCpsMap = new Map(videoCps.map((r) => [r.date, r]));
  const videoCpsAllMap = new Map(videoCpsAll.map((r) => [r.date, r]));
  const mgMap = new Map(mgAgg.map((r) => [r.date, r]));

  const allDates = new Set<string>();
  for (const m of [
    dailyMap,
    portraitMap,
    gameCpsMap,
    gameCpsAllMap,
    videoCpsMap,
    videoCpsAllMap,
    mgMap,
  ]) {
    for (const d of m.keys()) allDates.add(d);
  }
  const sortedDates = Array.from(allDates).sort();

  return sortedDates.map<AnchorDailyRow>((date) => {
    const d = dailyMap.get(date);
    const p = portraitMap.get(date);
    const gc = gameCpsMap.get(date);
    const ga = gameCpsAllMap.get(date);
    const vc = videoCpsMap.get(date);
    const va = videoCpsAllMap.get(date);
    const mg = mgMap.get(date);

    // 计算字段：直播当日流水 = (anchor_active_pay + faction_active_pay) / 0.4 + download_pay_amount
    const gPromoteActive = (() => {
      if (!ga) return null;
      const a = num(ga.g_anchor_active_pay);
      const f = num(ga.g_faction_active_pay);
      if (a === null && f === null) return null;
      return ((a ?? 0) + (f ?? 0)) / 0.4;
    })();
    const gTotal = (() => {
      if (!ga) return null;
      const a = num(ga.g_anchor_active_pay);
      const f = num(ga.g_faction_active_pay);
      const dn = num(ga.g_download_pay_amount);
      if (a === null && f === null && dn === null) return null;
      return ((a ?? 0) + (f ?? 0)) / 0.4 + (dn ?? 0);
    })();
    const vPromoteActive = (() => {
      if (!va) return null;
      const a = num(va.v_anchor_active_pay);
      const f = num(va.v_faction_active_pay);
      if (a === null && f === null) return null;
      return ((a ?? 0) + (f ?? 0)) / 0.4;
    })();
    const vTotal = (() => {
      if (!va) return null;
      const a = num(va.v_anchor_active_pay);
      const f = num(va.v_faction_active_pay);
      const dn = num(va.v_download_pay_amount);
      if (a === null && f === null && dn === null) return null;
      return ((a ?? 0) + (f ?? 0)) / 0.4 + (dn ?? 0);
    })();
    const controllerTotal =
      gTotal !== null || vTotal !== null ? (gTotal ?? 0) + (vTotal ?? 0) : null;

    // 所有字段统一过 num() —— PG 的 SUM(integer) 返回 bigint，驱动转成 string，
    // UI 端 typeof === "number" 检查会失败显示「—」。MAX(integer) 才返 number。
    return {
      date,
      // 音浪
      total_fan_ticket: num(d?.total_fan_ticket),
      live_fan_ticket_no_guest: num(d?.live_fan_ticket_no_guest),
      property_fan_ticket_no_guest: num(d?.property_fan_ticket_no_guest),
      guest_fan_ticket: num(d?.guest_fan_ticket),
      subscribe_fan_ticket: num(d?.subscribe_fan_ticket),
      pk_fan_ticket: num(d?.pk_fan_ticket),
      star_guard_earn_score: num(d?.star_guard_earn_score),
      stat_guard_enter_account_earn_score: num(d?.stat_guard_enter_account_earn_score),
      // 时长
      live_duration: num(d?.live_duration),
      valid_live_duration: num(d?.valid_live_duration),
      feed_watch_duration: num(d?.feed_watch_duration),
      live_days: num(d?.live_days),
      solo_valid_days: num(d?.solo_valid_days),
      // 互动
      total_fans: num(d?.total_fans),
      new_follow_fans: num(d?.new_follow_fans),
      peak_per_minute_ucnt: num(d?.peak_per_minute_ucnt),
      feed_acu: num(d?.feed_acu),
      current_percent: num(d?.current_percent),
      profit_share_ratio: num(d?.profit_share_ratio),
      // 视频
      video_view_count: num(d?.video_view_count),
      video_like_count: num(d?.video_like_count),
      video_comment_count: num(d?.video_comment_count),
      // portrait
      show_uv: num(p?.show_uv),
      show_cnt: num(p?.show_cnt),
      watch_uv: num(p?.watch_uv),
      watch_cnt: num(p?.watch_cnt),
      enter_room_rate: num(p?.enter_room_rate),
      avg_watch_duration: num(p?.avg_watch_duration),
      consume_uv: num(p?.consume_uv),
      consume_cnt: num(p?.consume_cnt),
      consume_rate: num(p?.consume_rate),
      // game cps
      g_live_cnt: num(gc?.g_live_cnt),
      g_live_duration: num(gc?.g_live_duration),
      g_live_duration_avg: num(gc?.g_live_duration_avg),
      g_watch_ucnt: num(gc?.g_watch_ucnt),
      g_watch_duration: num(gc?.g_watch_duration),
      g_watch_duration_uavg: num(gc?.g_watch_duration_uavg),
      g_acu: num(gc?.g_acu),
      g_pcu: num(gc?.g_pcu),
      g_like_ucnt: num(gc?.g_like_ucnt),
      g_comment_ucnt: num(gc?.g_comment_ucnt),
      g_follow_ucnt: num(gc?.g_follow_ucnt),
      g_like_uavg: num(gc?.g_like_uavg),
      g_comment_uavg: num(gc?.g_comment_uavg),
      g_follow_uavg: num(gc?.g_follow_uavg),
      g_click_download: num(gc?.g_click_download),
      g_start_download: num(gc?.g_start_download),
      g_download_finish: num(gc?.g_download_finish),
      g_install_finish: num(gc?.g_install_finish),
      g_active_ucnt: num(gc?.g_active_ucnt),
      g_pay_ucnt: num(gc?.g_pay_ucnt),
      g_pay_amount: num(gc?.g_pay_amount),
      g_props_pay_amount: num(gc?.g_props_pay_amount),
      g_props_anchor_amount: num(gc?.g_props_anchor_amount),
      g_props_faction_amount: num(gc?.g_props_faction_amount),
      g_anchor_income: num(gc?.g_anchor_income),
      g_faction_income: num(gc?.g_faction_income),
      // game cps_all
      g_download_pay_ucnt: num(ga?.g_download_pay_ucnt),
      g_download_pay_amount: num(ga?.g_download_pay_amount),
      g_anchor_download_pay: num(ga?.g_anchor_download_pay),
      g_faction_download_pay: num(ga?.g_faction_download_pay),
      g_active_pay_ucnt: num(ga?.g_active_pay_ucnt),
      g_anchor_active_pay: num(ga?.g_anchor_active_pay),
      g_faction_active_pay: num(ga?.g_faction_active_pay),
      g_promote_active_amount: gPromoteActive,
      g_total_amount: gTotal,
      // video cps
      v_publish_cnt: num(vc?.v_publish_cnt),
      v_vv: num(vc?.v_vv),
      v_uv: num(vc?.v_uv),
      v_uavg: num(vc?.v_uavg),
      v_finish_play_ucnt: num(vc?.v_finish_play_ucnt),
      v_finish_play_ratio: num(vc?.v_finish_play_ratio),
      v_like_ucnt: num(vc?.v_like_ucnt),
      v_follow_ucnt: num(vc?.v_follow_ucnt),
      v_comment_ucnt: num(vc?.v_comment_ucnt),
      v_like_uavg: num(vc?.v_like_uavg),
      v_follow_uavg: num(vc?.v_follow_uavg),
      v_comment_uavg: num(vc?.v_comment_uavg),
      v_click_download: num(vc?.v_click_download),
      v_start_download: num(vc?.v_start_download),
      v_download_finish: num(vc?.v_download_finish),
      v_install_finish: num(vc?.v_install_finish),
      v_active_ucnt: num(vc?.v_active_ucnt),
      v_charge_pay_ucnt: num(vc?.v_charge_pay_ucnt),
      v_pay_amount: num(vc?.v_pay_amount),
      v_anchor_income: num(vc?.v_anchor_income),
      v_faction_income: num(vc?.v_faction_income),
      // video cps_all
      v_download_pay_ucnt: num(va?.v_download_pay_ucnt),
      v_download_pay_amount: num(va?.v_download_pay_amount),
      v_anchor_download_pay: num(va?.v_anchor_download_pay),
      v_faction_download_pay: num(va?.v_faction_download_pay),
      v_active_pay_ucnt: num(va?.v_active_pay_ucnt),
      v_anchor_active_pay: num(va?.v_anchor_active_pay),
      v_faction_active_pay: num(va?.v_faction_active_pay),
      v_promote_active_amount: vPromoteActive,
      v_total_amount: vTotal,
      // 计算字段
      controller_total_amount: controllerTotal,
      minigame_total_amount: num(mg?.mg_before_income),
      // minigame
      mg_room_cnt: num(mg?.mg_room_cnt),
      mg_duration: num(mg?.mg_duration),
      mg_avg_room_live_duration: num(mg?.mg_avg_room_live_duration),
      mg_watch_ucnt: num(mg?.mg_watch_ucnt),
      mg_watch_duration: num(mg?.mg_watch_duration),
      mg_avg_user_watch_duration: num(mg?.mg_avg_user_watch_duration),
      mg_acu: num(mg?.mg_acu),
      mg_pcu: num(mg?.mg_pcu),
      mg_like_ucnt: num(mg?.mg_like_ucnt),
      mg_follow_ucnt: num(mg?.mg_follow_ucnt),
      mg_comment_ucnt: num(mg?.mg_comment_ucnt),
      mg_like_ratio: num(mg?.mg_like_ratio),
      mg_follow_ratio: num(mg?.mg_follow_ratio),
      mg_comment_ratio: num(mg?.mg_comment_ratio),
      mg_click_ucnt: num(mg?.mg_click_ucnt),
      mg_active_ucnt: num(mg?.mg_active_ucnt),
      mg_pay_ucnt: num(mg?.mg_pay_ucnt),
      mg_before_income: num(mg?.mg_before_income),
      mg_anchor_income: numOrNull(mg?.mg_anchor_income),
      mg_union_income: num(mg?.mg_union_income),
      mg_cps_bind: num(mg?.mg_cps_bind),
    };
  });
}

/**
 * 拉某主播的日明细 + 同期对比。
 */
export async function getAnchorDaily(
  anchorId: string,
  dateFrom: string,
  dateTo: string,
): Promise<AnchorDailyResponse> {
  const compareRange = shiftDateRange(dateFrom, dateTo);
  const [current, compare] = await Promise.all([
    fetchDailyOnePeriod(anchorId, dateFrom, dateTo),
    fetchDailyOnePeriod(anchorId, compareRange.from, compareRange.to),
  ]);
  return {
    anchor_id: anchorId,
    date_from: dateFrom,
    date_to: dateTo,
    current,
    compare,
  };
}
