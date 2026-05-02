export type ProjectFilter = "all" | "ddz" | "three";

export interface AnchorListFilters {
  /** 日期范围起始（含），YYYY-MM-DD */
  date_from: string;
  /** 日期范围截止（含），YYYY-MM-DD。等于 date_from 时为单日 */
  date_to: string;
  project?: ProjectFilter;
  broker_ids?: string[];
  health_min?: number;
  search?: string;
}

export interface AnchorListRow {
  // ── 1. 主播档案（基础属性）────────────────────────────────
  anchor_id: string;
  nick_name: string;
  is_threekingdoms: boolean;
  avatar: string | null;
  gender: number | null;
  aweme_display_id: string | null;
  aweme_short_id: string | null;
  hotsoon_display_id: string | null;
  xigua_display_id: string | null;
  real_name: string | null;
  anchor_health_score: number | null;
  anchor_health_score_level: number | null;
  anchor_ban_30d: number | null;
  anchor_violation_30d: number | null;
  notes: string | null;
  live_status: number | null;
  last_live_time: number | null;

  // ── 2. 签约 & 经纪人 ──────────────────────────────────────
  broker_name: string | null;
  recruit_broker_name: string | null;
  anchor_sign_type: number | null;
  anchor_sign_out: number | null;
  signing_time: number | null;
  sign_start_time: number | null;
  sign_end_time: number | null;
  union_member_end_date: number | null;
  auto_renewal: boolean | null;
  join_time: number | null;
  first_live_time_in_faction: number | null;
  leave_time: number | null;
  wait_for_leave: boolean | null;
  income_percent: number | null;

  // ── 3. 音浪明细（anchor_daily SUM）───────────────────────
  total_fan_ticket: number | null;
  live_fan_ticket_no_guest: number | null;
  property_fan_ticket_no_guest: number | null;
  guest_fan_ticket: number | null;
  activity_fan_ticket_no_guest: number | null;
  special_fan_ticket: number | null;
  subscribe_fan_ticket: number | null;
  pk_fan_ticket: number | null;
  link_screen_fan_ticket: number | null;
  link_screen_room_fan_ticket: number | null;
  star_guard_earn_score: number | null;
  stat_guard_enter_account_earn_score: number | null;
  total_ticket_outside_link: number | null;

  // ── 4. 时长 & 天数（anchor_daily SUM）───────────────────
  /** 区间内总开播时长 小时 (SUM) */
  live_duration: number | null;
  /** 有效时长 */
  valid_live_duration: number | null;
  /** feed 看播时长 */
  feed_watch_duration: number | null;
  /** 区间内有效开播天数 */
  live_days: number | null;
  /** 个播有效天 */
  solo_valid_days: number | null;

  // ── 5. 互动 & 粉丝（anchor_daily）────────────────────────
  total_fans: number | null;
  new_follow_fans: number | null;
  peak_per_minute_ucnt: number | null;
  feed_acu: number | null;
  /** 主分成比快照 (最新) */
  current_percent: number | null;
  /** 游戏分成比 */
  game_share_percent: number | null;
  /** 付费连线分成比 */
  pay_money_connect_share_percent: number | null;
  /** 会员收益比例 */
  profit_share_ratio: number | null;

  // ── 6. 视频统计（anchor_daily SUM）──────────────────────
  video_view_count: number | null;
  video_like_count: number | null;
  video_comment_count: number | null;

  // ── 7. 直播 portrait（曝光/进房/付费转化）────────────────
  show_uv: number | null;
  show_cnt: number | null;
  watch_uv: number | null;
  watch_cnt: number | null;
  enter_room_rate: number | null;
  avg_watch_duration: number | null;
  consume_uv: number | null;
  consume_cnt: number | null;
  consume_rate: number | null;

  // ── 8. 推广游戏（anchor_game_promo_daily，g_ 前缀）───────
  /** 直播场次 (cps) */
  g_live_cnt: number | null;
  /** 直播时长 h (cps) */
  g_live_duration: number | null;
  /** 看播人数 UV (cps) */
  g_watch_ucnt: number | null;
  /** ACU (cps) */
  g_acu: number | null;
  /** PCU (cps) */
  g_pcu: number | null;
  /** 点赞人数 (cps) */
  g_like_ucnt: number | null;
  /** 评论人数 (cps) */
  g_comment_ucnt: number | null;
  /** 关注人数 (cps) */
  g_follow_ucnt: number | null;
  /** 发布视频数 (cps) */
  g_video_publish_cnt: number | null;
  /** 视频VV (cps) */
  g_video_vv: number | null;
  /** 视频UV (cps) */
  g_video_uv: number | null;
  /** 点击下载 (cps) */
  g_click_download: number | null;
  /** 下载完成 (cps) */
  g_download_finish: number | null;
  /** 安装完成 (cps) */
  g_install_finish: number | null;
  /** 激活人数 (cps) */
  g_active_ucnt: number | null;
  /** 付费人数 (cps) */
  g_pay_ucnt: number | null;
  /** 付费金额 (cps) */
  g_pay_amount: number | null;
  /** 道具流水 (cps) */
  g_props_pay_amount: number | null;
  /** 主播道具分成 (cps) */
  g_props_anchor_amount: number | null;
  /** 机构道具分成 (cps) */
  g_props_faction_amount: number | null;
  /** 主播分账 (cps) */
  g_anchor_income: number | null;
  /** 机构分账 (cps) */
  g_faction_income: number | null;
  /** 下载激励付费人数 (cps_all) */
  g_download_pay_ucnt: number | null;
  /** 下载激励付费金额 (cps_all) */
  g_download_pay_amount: number | null;
  /** 下载激励主播分账 (cps_all) */
  g_anchor_download_pay: number | null;
  /** 下载激励机构分账 (cps_all) */
  g_faction_download_pay: number | null;
  /** 活跃激励付费人数 (cps_all) */
  g_active_pay_ucnt: number | null;
  /** 活跃激励主播分账 (cps_all) */
  g_anchor_active_pay: number | null;
  /** 活跃激励机构分账 (cps_all) */
  g_faction_active_pay: number | null;

  // ── 9. 小游戏（anchor_minigame_daily，mg_ 前缀）──────────
  /** 开播场次 */
  mg_room_cnt: number | null;
  /** 开播时长 h */
  mg_duration: number | null;
  /** 看播人数 UV */
  mg_watch_ucnt: number | null;
  /** 看播时长 */
  mg_watch_duration: number | null;
  /** ACU */
  mg_acu: number | null;
  /** PCU */
  mg_pcu: number | null;
  /** 点赞人数 */
  mg_like_ucnt: number | null;
  /** 关注人数 */
  mg_follow_ucnt: number | null;
  /** 评论人数 */
  mg_comment_ucnt: number | null;
  /** 小游戏点击人数 */
  mg_click_ucnt: number | null;
  /** 小游戏激活人数 */
  mg_active_ucnt: number | null;
  /** 小游戏付费人数 */
  mg_pay_ucnt: number | null;
  /** 分成前流水 */
  mg_before_income: number | null;
  /** 主播分成 */
  mg_anchor_income: number | null;
  /** 公会分成 */
  mg_union_income: number | null;
  /** CPS 绑定人数 */
  mg_cps_bind: number | null;
  /** 视频播放数 */
  mg_play_cnt: number | null;
  /** 视频播放人数 */
  mg_play_uv: number | null;
  /** 完播人数 */
  mg_finish_play_uv: number | null;
  /** 完播率 */
  mg_finish_play_ratio: number | null;

  // ── 旧兼容字段（保留，用于平滑迁移）────────────────────
  /** @deprecated 用 mg_anchor_income */
  minigame_income: number | null;
  /** @deprecated 用 g_anchor_income */
  game_income: number | null;
}
