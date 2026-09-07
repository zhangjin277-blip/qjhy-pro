export type ProjectKey = "ddz" | "three" | "zhaohua";

export type MetricKey =
  | "total_fan_ticket"
  | "flow"
  | "active_anchor_count"
  | "new_anchor_count"
  | "first_live_anchor_count";

export interface DashboardMetric {
  key: MetricKey;
  label: string;
  value: number;
  previous: number | null;
  change_percent: number | null;
  anchor_count: number;
  trend: number[];
}

export interface ProjectOverview {
  key: ProjectKey;
  label: string;
  metrics: DashboardMetric[];
}

export interface DashboardResponse {
  date: string;
  generated_at: string;
  projects: ProjectOverview[];
}

export interface RankingItem {
  anchor_id: string;
  nickname: string;
  display_id: string | null;
  broker_name: string | null;
  value: number;
  display_date?: string;
}

export interface MetricDetailResponse {
  date: string;
  project: ProjectKey;
  project_label: string;
  metric: MetricKey;
  metric_label: string;
  total_anchors: number;
  items: RankingItem[];
}
