import { index, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * 审计日志（所有权限变更、应急登录、同步等关键操作都写这张表）。
 *
 * - user_id: 操作人（系统操作如同步任务为 null）
 * - action: 动作码，命名 SCREAMING_SNAKE_CASE，例 'PERMISSION_OVERRIDE_UPSERT'
 * - target_type / target_id: 操作对象类型 + ID
 * - before / after: 变更前后快照（JSON），用于追溯
 */
export const audit_log = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    user_id: text("user_id"),
    action: text("action").notNull(),
    target_type: text("target_type"),
    target_id: text("target_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    user_agent: text("user_agent"),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    idx_user_time: index("idx_audit_user_time").on(t.user_id, t.created_at),
    idx_action_time: index("idx_audit_action_time").on(t.action, t.created_at),
  }),
);
