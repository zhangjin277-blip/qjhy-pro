import { index, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * 实体别名（与钉钉同步完全解耦）。
 *
 * - 钉钉同步永远不动这张表，sync 只更新 dingtalk_dept/dingtalk_user 的 name 字段
 * - 显示层：alias 存在时优先用 alias，原名作为 hover 兜底
 * - entity_type 当前只支持 'dept'，'user' / 'field' 等以后扩展
 * - updated_by: 操作人 user_id（不加 FK，与 audit_log 同样宽松，保证用户被删/同步丢失时不级联）
 */
export const entity_alias = pgTable(
  "entity_alias",
  {
    id: serial("id").primaryKey(),
    entity_type: text("entity_type", { enum: ["dept", "user"] }).notNull(),
    entity_id: text("entity_id").notNull(),
    alias: text("alias").notNull(),
    note: text("note"),
    updated_by: text("updated_by"),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    unique_entity: unique("uq_entity_alias_entity").on(t.entity_type, t.entity_id),
    idx_type: index("idx_entity_alias_type").on(t.entity_type),
  }),
);
