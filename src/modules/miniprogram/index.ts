import type {
  DashboardOverviewResponse,
  DrawerDetailResponse,
  ProjectKey,
} from "@/modules/dashboard";

export const MINI_PROGRAM_METRICS = [
  "total_fan_ticket",
  "flow",
  "active_anchor_count",
  "new_anchor_count",
  "first_live_anchor_count",
] as const;

export type MiniProgramMetricKey = (typeof MINI_PROGRAM_METRICS)[number];

export interface MiniProgramMetric {
  key: MiniProgramMetricKey;
  label: string;
  value: number;
  previous: number | null;
  change_percent: number | null;
  anchor_count: number;
  trend: number[];
}

export interface MiniProgramProjectOverview {
  key: ProjectKey;
  label: string;
  metrics: MiniProgramMetric[];
}

export interface MiniProgramDashboardResponse {
  date: string;
  generated_at: string;
  projects: MiniProgramProjectOverview[];
}

export interface MiniProgramRankingItem {
  anchor_id: string;
  nickname: string;
  display_id: string | null;
  broker_name: string | null;
  value: number;
  display_date?: string;
}

export interface MiniProgramMetricDetailResponse {
  date: string;
  project: ProjectKey;
  project_label: string;
  metric: MiniProgramMetricKey;
  metric_label: string;
  total_anchors: number;
  items: MiniProgramRankingItem[];
}

const METRIC_LABELS: Record<MiniProgramMetricKey, string> = {
  total_fan_ticket: "音浪",
  flow: "流水",
  active_anchor_count: "开播主播",
  new_anchor_count: "新入驻主播",
  first_live_anchor_count: "首次开播",
};

const PROJECTS: { key: ProjectKey; label: string }[] = [
  { key: "ddz", label: "斗地主" },
  { key: "three", label: "三国冰河时代" },
  { key: "zhaohua", label: "造化仙府" },
];

export function toMiniProgramDashboard(
  overview: DashboardOverviewResponse,
  generatedAt = new Date().toISOString(),
): MiniProgramDashboardResponse {
  const rows = new Map(overview.breakdown.map((row) => [row.metric, row]));

  return {
    date: overview.date_to,
    generated_at: generatedAt,
    projects: PROJECTS.map((project) => ({
      ...project,
      metrics: MINI_PROGRAM_METRICS.map((metric) => {
        const value = rows.get(metric)?.[project.key].total;
        return {
          key: metric,
          label: METRIC_LABELS[metric],
          value: value?.value ?? 0,
          previous: value?.prev_value ?? null,
          change_percent: value?.vs_prev ?? null,
          anchor_count: value?.anchor_count ?? 0,
          trend: value?.sparkline ?? [],
        };
      }),
    })),
  };
}

export function toMiniProgramMetricDetail(
  detail: DrawerDetailResponse,
  date: string,
  project: ProjectKey,
  metric: MiniProgramMetricKey,
): MiniProgramMetricDetailResponse {
  return {
    date,
    project,
    project_label: PROJECTS.find((item) => item.key === project)?.label ?? project,
    metric,
    metric_label: METRIC_LABELS[metric],
    total_anchors: detail.total_anchors,
    items: detail.top_anchors.map((anchor) => ({
      anchor_id: anchor.anchor_id,
      nickname: anchor.nick_name || "未命名主播",
      display_id: anchor.aweme_display_id,
      broker_name: anchor.broker_name,
      value: anchor.metric_value,
      display_date: anchor.display_date,
    })),
  };
}
