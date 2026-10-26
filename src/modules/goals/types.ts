export type GoalStatus = "draft" | "published" | "closed";
export interface GoalQualification {
  roi: number;
  min_cost: number;
}
export interface GoalBinding {
  source: "douyin" | "buyu";
  product: string;
  field: string;
  selection: "all" | "accounts" | "operators";
  account_ids: string[];
  /** Server-created snapshot. Draft operator goals always resolve current ownership. */
  account_snapshot_at?: string | null;
  direction: "gte" | "lte";
  qualification: GoalQualification | null;
  /** Total fishing scope uses explicit per-product thresholds, inherited by operators. */
  qualification_by_product?: Record<string, GoalQualification>;
  /** 捕鱼消耗个人拆分：每个关联账号的独立目标值（合计等于个人目标）。 */
  account_targets?: Record<string, number>;
}
export interface GoalSourceResult {
  status: "ready" | "partial" | "pending" | "forbidden" | "error";
  note: string;
  product_details?: GoalProductDetail[];
  account_progress?: GoalAccountProgress[];
  account_values?: GoalAccountValue[];
  /** Only additive metrics can display each account's contribution to the total. */
  account_values_additive?: boolean;
  unknown_accounts?: number;
  missing_accounts?: { id: string; name: string }[];
  /** Additive metrics: accounts without period records contribute zero. */
  no_record_accounts?: { id: string; name: string }[];
  matched_accounts?: { id: string; name: string }[];
}
export interface GoalAccountValue {
  id: string;
  name: string;
  product?: string;
  product_name?: string;
  actual: number | null;
  as_of: string | null;
  status: "ready" | "no_record" | "pending";
  note: string;
}
export interface GoalAccountProgress {
  id: string;
  name: string;
  product: string;
  product_name: string;
  roi: number | null;
  cost: number | null;
  required_roi: number | null;
  required_cost: number | null;
  roi_gap: number | null;
  cost_gap: number | null;
  status: "qualified" | "unqualified" | "pending" | "excluded";
  as_of: string | null;
  note: string;
}
export interface GoalProductDetail {
  product: string;
  name: string;
  actual: number | null;
  note: string;
  accounts: { id: string; name: string; actual: number | null; note: string }[];
}
export interface GoalDefinition {
  period: string;
  project: string;
  line: string;
  dept_id: string | null;
  owner_ids: string[];
  owner_labels: string[];
  metric: string;
  binding?: GoalBinding | null;
  unit: string;
  kind: "sum" | "count" | "ratio";
  target: number | null;
  /** Null uses equal weights; explicit percentages are normalized in the visible scope. */
  weight?: number | null;
  definition: string;
  confirmed: boolean;
  parent_id: string | null;
  /** Representative metric ID of the team group; independent of quarter allocation. */
  team_parent_id?: string | null;
}
export interface Goal extends GoalDefinition {
  /** List-only access to a participating team; does not grant source account or edit rights. */
  read_only?: boolean;
  source_result?: GoalSourceResult;
  id: string;
  actual: number | null;
  as_of: string | null;
  evidence: string;
  status: GoalStatus;
  version: number;
  created_by: string;
  deleted_at?: string | null;
  updated_at: string;
}
export interface GoalAccess {
  isEmergency?: boolean;
  userId: string;
  name: string;
  scope: "none" | "self" | "team" | "all";
  points: string[];
  deptIds: string[];
  delegatedIds: string[] | null;
}
export interface GoalPreview extends Goal {
  previous?: Goal;
}
export type GoalPreviewMode = "current" | "comparison" | "previous";
export interface GoalList {
  items: Goal[];
  access: {
    fill: boolean;
    publish: boolean;
    scope: string;
    userId?: string;
    canManageTeam?: boolean;
  };
  users: { id: string; name: string; deptIds: string[] }[];
  departments: { id: string; name: string }[];
}
/** Minimal team definition exposed to an eligible operator, without team account lists or actuals. */
export interface PersonalTeamOption {
  id: string;
  period: string;
  project: string;
  dept_id: string | null;
  department: string;
  owners: string[];
  source: "douyin" | "buyu";
  accounts: { id: string; name: string; products?: string[] }[];
  product: string;
  metrics: {
    id: string;
    version: number;
    metric: string;
    unit: string;
    kind: GoalDefinition["kind"];
    target: number;
    weight: number;
    definition: string;
    available: number;
    existing: {
      id: string;
      version: number;
      target: number | null;
      status: GoalStatus;
      account_targets?: Record<string, number>;
    } | null;
  }[];
}
export interface GoalRevision {
  id: string;
  action: string;
  reason: string;
  actor_name: string;
  created_at: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
}
