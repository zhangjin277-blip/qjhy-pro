export type EntityType = "dept" | "user";

export interface AliasRow {
  entity_type: EntityType;
  entity_id: string;
  alias: string;
  note: string | null;
  updated_by: string | null;
  updated_at: Date;
}

/** 部门别名 lookup（entity_id → { alias, note }）*/
export type DeptAliasMap = Map<string, { alias: string; note: string | null }>;
