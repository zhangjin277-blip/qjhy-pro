export type OperationMetricKey = "total_fan_ticket" | "flow" | "active_anchor_count";

export interface OperationMetricProgress {
  key: OperationMetricKey;
  label: string;
  value: number;
  target: number | null;
  completionPercent: number | null;
  remaining: number | null;
}

export interface OperationPerformanceResponse {
  month: string;
  dateFrom: string;
  dateTo: string;
  user: { id: string; name: string };
  managedAnchorCount: number;
  brokerNames: string[];
  metrics: OperationMetricProgress[];
}

export interface OperationTargetRow {
  userId: string;
  name: string;
  brokerNames: string[];
  managedAnchorCount: number;
  fanTicketTarget: number | null;
  flowTarget: number | null;
  activeAnchorTarget: number | null;
}
