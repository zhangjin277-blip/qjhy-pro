// 已存 raw 数据的 anchor_game_promo_daily / anchor_minigame_daily 用新 parser 重新解析非 raw 字段。
// 不重跑爬虫，节省时间。
import { db } from "@/db/client";
import { anchor_game_promo_daily, anchor_minigame_daily } from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";
import {
  parseGamePromoRow,
  parseMinigameRow,
  type PromoteScene,
  type BizMode,
  type MinigameScene,
} from "@/modules/crawler/server";

async function main(): Promise<void> {
  const date = process.env.DATE ?? "2026-05-01";

  // ── game-promo ───────────────────────────────────────────────────────
  // 只处理新爬虫写入的行（raw 是 camelCase 英文 key）
  // 老库 PRO3 迁来的数据 raw 是中文 key（如 "游戏名称"），用英文 parser 会全部清成 NULL
  const gameRows = await db
    .select()
    .from(anchor_game_promo_daily)
    .where(
      and(
        eq(anchor_game_promo_daily.date, date),
        sql`(${anchor_game_promo_daily.raw} ? 'gameName' OR ${anchor_game_promo_daily.raw} ? 'anchorName')`,
      ),
    );
  console.log(`[reparse] game rows=${gameRows.length}`);

  const i = (n: number | null): number | null => (n != null ? Math.round(n) : null);
  const s = (n: number | null): string | null => (n != null ? String(n) : null);

  let gameUpdated = 0;
  for (const row of gameRows) {
    const reparsed = parseGamePromoRow(
      row.raw as Record<string, string>,
      row.promote_scene as PromoteScene,
      row.biz_mode as BizMode,
      date,
    );
    const update = {
      promote_live_cnt_1d: i(reparsed.promote_live_cnt_1d),
      promote_live_duration_1d: s(reparsed.promote_live_duration_1d),
      promote_live_duration_avg: s(reparsed.promote_live_duration_avg),
      promote_live_watch_ucnt_1d: i(reparsed.promote_live_watch_ucnt_1d),
      promote_live_watch_duration_1d: s(reparsed.promote_live_watch_duration_1d),
      promote_live_watch_duration_uavg_1d: s(reparsed.promote_live_watch_duration_uavg_1d),
      acu: i(reparsed.acu),
      pcu: i(reparsed.pcu),
      promote_live_like_ucnt_1d: i(reparsed.promote_live_like_ucnt_1d),
      promote_live_comment_ucnt_1d: i(reparsed.promote_live_comment_ucnt_1d),
      promote_live_follow_ucnt_1d: i(reparsed.promote_live_follow_ucnt_1d),
      promote_live_like_uavg_1d: s(reparsed.promote_live_like_uavg_1d),
      promote_live_comment_uavg_1d: s(reparsed.promote_live_comment_uavg_1d),
      promote_live_follow_uavg_1d: s(reparsed.promote_live_follow_uavg_1d),
      promote_video_publish_cnt_1d: i(reparsed.promote_video_publish_cnt_1d),
      promote_item_vv_1d: i(reparsed.promote_item_vv_1d),
      promote_item_uv_1d: i(reparsed.promote_item_uv_1d),
      promote_item_uavg_1d: s(reparsed.promote_item_uavg_1d),
      promote_finish_play_ucnt_1d: i(reparsed.promote_finish_play_ucnt_1d),
      promote_finish_play_ratio_1d: s(reparsed.promote_finish_play_ratio_1d),
      promote_click_download_ucnt_1d: i(reparsed.promote_click_download_ucnt_1d),
      promote_start_download_ucnt_1d: i(reparsed.promote_start_download_ucnt_1d),
      promote_download_finish_ucnt_1d: i(reparsed.promote_download_finish_ucnt_1d),
      promote_install_finish_ucnt_1d: i(reparsed.promote_install_finish_ucnt_1d),
      promote_active_ucnt_1d: i(reparsed.promote_active_ucnt_1d),
      promote_pay_ucnt_1d: i(reparsed.promote_pay_ucnt_1d),
      promote_pay_amount_1d: i(reparsed.promote_pay_amount_1d),
      promote_charge_pay_ucnt_1d: i(reparsed.promote_charge_pay_ucnt_1d),
      props_pay_amount_1d: i(reparsed.props_pay_amount_1d),
      props_anchor_pay_amount_1d: i(reparsed.props_anchor_pay_amount_1d),
      props_faction_pay_amount_1d: i(reparsed.props_faction_pay_amount_1d),
      promote_anchor_income_1d: i(reparsed.promote_anchor_income_1d),
      promote_faction_income_1d: i(reparsed.promote_faction_income_1d),
      promote_download_pay_ucnt_1d: i(reparsed.promote_download_pay_ucnt_1d),
      promote_download_pay_amount_1d: i(reparsed.promote_download_pay_amount_1d),
      promote_anchor_download_pay_amount_1d: i(reparsed.promote_anchor_download_pay_amount_1d),
      promote_faction_download_pay_amount_1d: i(reparsed.promote_faction_download_pay_amount_1d),
      promote_active_pay_ucnt_1d: i(reparsed.promote_active_pay_ucnt_1d),
      promote_anchor_active_pay_amount_1d: i(reparsed.promote_anchor_active_pay_amount_1d),
      promote_faction_active_pay_amount_1d: i(reparsed.promote_faction_active_pay_amount_1d),
    };
    await db
      .update(anchor_game_promo_daily)
      .set(update)
      .where(
        and(
          eq(anchor_game_promo_daily.anchor_id, row.anchor_id),
          eq(anchor_game_promo_daily.date, row.date),
          eq(anchor_game_promo_daily.promote_scene, row.promote_scene),
          eq(anchor_game_promo_daily.biz_mode, row.biz_mode),
          eq(anchor_game_promo_daily.game_name, row.game_name),
        ),
      );
    gameUpdated++;
  }
  console.log(`[reparse] game updated=${gameUpdated}`);

  // ── minigame ─────────────────────────────────────────────────────────
  // 同 game-promo：跳过老库迁的中文 key 数据
  const mgRows = await db
    .select()
    .from(anchor_minigame_daily)
    .where(
      and(
        eq(anchor_minigame_daily.date, date),
        sql`(${anchor_minigame_daily.raw} ? 'mpName' OR ${anchor_minigame_daily.raw} ? 'anchorName')`,
      ),
    );
  console.log(`[reparse] minigame rows=${mgRows.length}`);

  let mgUpdated = 0;
  for (const row of mgRows) {
    const reparsed = parseMinigameRow(
      row.raw as Record<string, string>,
      row.scene as MinigameScene,
      date,
    );
    const update = {
      live_room_cnt: i(reparsed.live_room_cnt),
      live_duration: s(reparsed.live_duration),
      avg_room_live_duration: s(reparsed.avg_room_live_duration),
      avg_user_watch_duration: s(reparsed.avg_user_watch_duration),
      watch_ucnt: i(reparsed.watch_ucnt),
      watch_duration: s(reparsed.watch_duration),
      acu: i(reparsed.acu),
      pcu: i(reparsed.pcu),
      like_ucnt: i(reparsed.like_ucnt),
      follow_ucnt: i(reparsed.follow_ucnt),
      comment_ucnt: i(reparsed.comment_ucnt),
      like_ucnt_ratio: s(reparsed.like_ucnt_ratio),
      follow_ucnt_ratio: s(reparsed.follow_ucnt_ratio),
      comment_ucnt_ratio: s(reparsed.comment_ucnt_ratio),
      gm_click_ucnt: i(reparsed.gm_click_ucnt),
      gm_active_ucnt: i(reparsed.gm_active_ucnt),
      gm_pay_ucnt: i(reparsed.gm_pay_ucnt),
      before_divided_income: s(reparsed.before_divided_income),
      after_divided_author_income: s(reparsed.after_divided_author_income),
      after_divided_trade_union_income: s(reparsed.after_divided_trade_union_income),
      cps_bind_uv: i(reparsed.cps_bind_uv),
    };
    await db
      .update(anchor_minigame_daily)
      .set(update)
      .where(
        and(
          eq(anchor_minigame_daily.anchor_id, row.anchor_id),
          eq(anchor_minigame_daily.date, row.date),
          eq(anchor_minigame_daily.scene, row.scene),
          eq(anchor_minigame_daily.mp_name, row.mp_name),
        ),
      );
    mgUpdated++;
  }
  console.log(`[reparse] minigame updated=${mgUpdated}`);
  console.log(`[reparse] DATE=${date} done.`);
  void sql; // keep import
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
