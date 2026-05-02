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
  /** 区间内总音浪 (SUM) */
  total_fan_ticket: number | null;
  /** 区间内总开播时长 小时 (SUM) */
  live_duration: number | null;
  /** 区间内有效开播天数 */
  live_days: number | null;
  /** 区间内总涨粉 */
  new_follow_fans: number | null;
  /** 区间内总视频播放 */
  video_view_count: number | null;
  /** 小游戏分账 SUM (待 game adapter 后续) */
  minigame_income: number | null;
  /** 推广游戏分账 SUM (待 game adapter 后续) */
  game_income: number | null;
}
