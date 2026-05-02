import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * 经纪人 ↔ 钉钉 user 映射。
 * 每天 sync 后 fuzzy match anchor_profile.broker_name ↔ dingtalk_user.name 自动填。
 * admin 页可手动改（match_source='manual' 优先于 'auto'）。
 */
export const broker_user_mapping = pgTable(
  "broker_user_mapping",
  {
    broker_id: text("broker_id").primaryKey(),
    broker_name: text("broker_name").notNull(),
    dingtalk_user_id: text("dingtalk_user_id"),
    match_source: text("match_source", { enum: ["auto", "manual", "pending"] })
      .notNull()
      .default("pending"),
    matched_at: timestamp("matched_at"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uniq_user: unique("uq_broker_mapping_user").on(t.dingtalk_user_id), // 一个钉钉 user 只能对应一个 broker；unique 约束已隐含 btree 索引，无需再建 idx_user
  }),
);
