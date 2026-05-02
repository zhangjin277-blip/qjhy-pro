export type ProjectFilter = "all" | "ddz" | "three";

export interface AnchorListFilters {
  date: string; // YYYY-MM-DD
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
  total_fan_ticket: number | null; // 当日
  live_duration_1d: number | null;
  minigame_income: number | null; // after_divided_author_income SUM
  game_income: number | null; // promote_anchor_income_1d SUM
}
