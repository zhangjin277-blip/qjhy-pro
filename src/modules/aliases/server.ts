import "server-only";

import { db } from "@/db/client";
import { entity_alias } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { DeptAliasMap } from "./types";

/** 批量获取所有部门别名（dept_id → { alias, note }） */
export async function getDeptAliasMap(): Promise<DeptAliasMap> {
  const rows = await db
    .select({
      entity_id: entity_alias.entity_id,
      alias: entity_alias.alias,
      note: entity_alias.note,
    })
    .from(entity_alias)
    .where(eq(entity_alias.entity_type, "dept"));

  const map: DeptAliasMap = new Map();
  for (const r of rows) {
    map.set(r.entity_id, { alias: r.alias, note: r.note });
  }
  return map;
}
