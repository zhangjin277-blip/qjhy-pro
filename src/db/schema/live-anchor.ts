import { date, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { dingtalk_user } from "./dingtalk";

/**
 * 主播业务扩展表。
 * 钉钉用户中，仅"主播角色"的子集在此有行（约 50 人）。
 * 表的存在本身就是"是否主播"的标记。
 */
export const live_anchor = pgTable(
  "live_anchor",
  {
    dingtalk_user_id: text("dingtalk_user_id")
      .primaryKey()
      .references(() => dingtalk_user.user_id),

    business_line: text("business_line").notNull(), // 拆到产品级：'捕鱼大作战' | '途游休闲捕鱼' | '电玩捕鱼' | '斗地主' | '麻将' | '三国:冰河时代'
    // 主播类型：用于区分生态主播与竞价主播；存量记录默认按生态主播处理
    anchor_type: text("anchor_type").notNull().default("生态主播"),
    employment_type: text("employment_type").notNull(), // '正式' | '合作' | '试播'
    work_status: text("work_status").notNull().default("active"), // 'active' | 'rest' | 'leave'

    trial_start_date: date("trial_start_date"),
    contract_date: date("contract_date"),
    leave_date: date("leave_date"),

    external_name: text("external_name"), // 钉钉外合作主播兜底名

    raw: jsonb("raw").notNull().default({}),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    idx_business: index("idx_live_anchor_business").on(t.business_line),
    idx_status: index("idx_live_anchor_status").on(t.work_status),
  }),
);
