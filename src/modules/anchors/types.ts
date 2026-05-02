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
  anchor_id: string;
  nick_name: string;
  is_threekingdoms: boolean;
  broker_name: string | null;
  recruit_broker_name: string | null;
  anchor_health_score: number | null;
  total_fans: number | null;

  /** 区间内总音浪 (SUM) */
  total_fan_ticket: number | null;
  /** 礼物音浪 */
  live_fan_ticket_no_guest: number | null;
  /** 道具音浪 */
  property_fan_ticket_no_guest: number | null;
  /** 嘉宾音浪 */
  guest_fan_ticket: number | null;
  /** 活动音浪 */
  activity_fan_ticket_no_guest: number | null;
  /** 其他音浪 */
  special_fan_ticket: number | null;
  /** 会员订阅音浪 */
  subscribe_fan_ticket: number | null;
  /** 星守护音浪 */
  star_guard_earn_score: number | null;

  /** 区间内总开播时长 小时 (SUM) */
  live_duration: number | null;
  /** 有效时长 */
  valid_live_duration: number | null;
  /** 区间内有效开播天数 */
  live_days: number | null;
  /** 个播有效天 */
  solo_valid_days: number | null;
  /** 区间内总涨粉 */
  new_follow_fans: number | null;
  /** 人气峰值（区间内最大） */
  peak_per_minute_ucnt: number | null;
  /** feed_acu */
  feed_acu: number | null;
  /** feed 看播时长 */
  feed_watch_duration: number | null;

  /** 视频统计 */
  video_view_count: number | null;
  video_like_count: number | null;
  video_comment_count: number | null;

  /** 小游戏分账 SUM (待 game adapter 后续) */
  minigame_income: number | null;
  /** 推广游戏分账 SUM (待 game adapter 后续) */
  game_income: number | null;
}
