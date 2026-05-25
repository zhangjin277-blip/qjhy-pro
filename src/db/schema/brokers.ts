import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * 经纪人 / 运营代号 ↔ 钉钉 user 映射。
 *
 * 来源 1：抖音 anchor_profile.broker_name 每天 sync 后 fuzzy match dingtalk_user.name 自动填。
 * 来源 2：快手 kuaishou_member.broker_name_raw 同样查此表（admin 手动配）。
 * 来源 3：admin 可手动添加任意外部代号 → 钉钉员工映射（如"李子玥"→陈家乐）。
 *
 * - broker_id: 唯一主键。抖音侧 = 抖音 broker_id 字符串；admin 手动加 = 名字本身
 * - match_source: 'manual' > 'auto' > 'pending'，sync 不覆盖 manual 行
 * - dingtalk_user_id 没有 unique 约束（允许 N:1：多个外部代号映射到同一员工）
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
    idx_user: index("idx_broker_mapping_user").on(t.dingtalk_user_id),
  }),
);
