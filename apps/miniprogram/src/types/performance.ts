export interface PerformanceMetric {
  key: "total_fan_ticket" | "flow" | "active_anchor_count";
  label: string;
  value: number;
  target: number | null;
  completionPercent: number | null;
  remaining: number | null;
}

export interface PerformanceResponse {
  month: string;
  dateFrom: string;
  dateTo: string;
  user: { id: string; name: string };
  managedAnchorCount: number;
  brokerNames: string[];
  metrics: PerformanceMetric[];
}
