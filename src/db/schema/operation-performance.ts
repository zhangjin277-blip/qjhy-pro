import { index, numeric, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { dingtalk_user } from "./dingtalk";

export const operation_monthly_target = pgTable(
  "operation_monthly_target",
  {
    user_id: text("user_id")
      .notNull()
      .references(() => dingtalk_user.user_id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    fan_ticket_target: numeric("fan_ticket_target", { precision: 18, scale: 2 }).notNull(),
    flow_target: numeric("flow_target", { precision: 18, scale: 2 }).notNull(),
    active_anchor_target: numeric("active_anchor_target", { precision: 10, scale: 2 }).notNull(),
    updated_by_user_id: text("updated_by_user_id").references(() => dingtalk_user.user_id),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.user_id, table.month] }),
    idx_month: index("idx_operation_monthly_target_month").on(table.month),
  }),
);
