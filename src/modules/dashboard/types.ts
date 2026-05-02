export interface DashboardCards {
  total_fan_ticket_today: number;
  active_anchors_today: number;
  minigame_income_today: number;
  game_income_today: number;
  health_warn_count: number;
  violation_count: number;
}

export interface TrendPoint {
  date: string;
  total_fan_ticket: number;
  total_duration: number;
}

export interface BrokerAggregate {
  broker_id: string;
  broker_name: string;
  user_name: string | null;
  anchor_count: number;
  total_fan_ticket: number;
  total_duration: number;
  total_minigame_income: number;
  avg_health_score: number | null;
}
