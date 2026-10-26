import { date, index, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { live_account } from "./live-account";
import { live_anchor } from "./live-anchor";
import { sql } from "drizzle-orm";

/**
 * 账号 ↔ 主播 N:M 默认排班关联表。
 * 1 行 = "某主播在某账号上的默认排班规则"。
 * 个播：1 行（1 主播 1 账号）。
 * 轮播：N 行（N 主播 1 账号，时段不同）。
 *
 * effective_from/to: 不直接 UPDATE 旧排班，新建一行 + 旧的设 effective_to。
 */
export const account_anchor_default = pgTable(
  "account_anchor_default",
  {
    id: text("id").primaryKey(),
    account_id: text("account_id")
      .notNull()
      .references(() => live_account.id, { onDelete: "restrict" }),
    dingtalk_user_id: text("dingtalk_user_id")
      .notNull()
      .references(() => live_anchor.dingtalk_user_id),

    time_slots: jsonb("time_slots").notNull().$type<[string, string][]>(), // [["12:00","18:00"]]
    rest_days: jsonb("rest_days").notNull().default([]).$type<number[]>(), // [1, 3] ISO weekday
    remark: text("remark"),

    effective_from: date("effective_from")
      .notNull()
      .default(sql`CURRENT_DATE`),
    effective_to: date("effective_to"), // null = 持续生效

    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    unique_acc_anchor_eff: unique("uq_account_anchor_default_eff").on(
      t.account_id,
      t.dingtalk_user_id,
      t.effective_from,
    ),
    idx_account: index("idx_account_anchor_default_account").on(t.account_id),
    idx_anchor: index("idx_account_anchor_default_anchor").on(t.dingtalk_user_id),
    idx_effective: index("idx_account_anchor_default_effective").on(
      t.effective_from,
      t.effective_to,
    ),
  }),
);
