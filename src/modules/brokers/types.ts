export interface BrokerMappingRow {
  broker_id: string;
  broker_name: string;
  dingtalk_user_id: string | null;
  match_source: "auto" | "manual" | "pending";
  matched_at: Date | null;
}
