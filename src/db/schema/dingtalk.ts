import { boolean, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * 钉钉部门（权威源，定时同步，本地只读）。
 *
 * dept_id 来自钉钉 API（数字），我们用 text 存以保留前导零等可能性。
 * raw 存钉钉返回的完整 JSON——未来钉钉加字段无需改 schema。
 */
export const dingtalk_dept = pgTable(
  "dingtalk_dept",
  {
    dept_id: text("dept_id").primaryKey(),
    name: text("name").notNull(),
    parent_id: text("parent_id"), // 顶级部门为 null
    raw: jsonb("raw").notNull(),
    synced_at: timestamp("synced_at").notNull().defaultNow(),
  },
  (t) => ({
    idx_parent: index("idx_dingtalk_dept_parent").on(t.parent_id),
  }),
);

/**
 * 钉钉人员（权威源，定时同步，本地只读）。
 *
 * - user_id: 钉钉 userid（同企业内唯一）
 * - unionid: 钉钉 unionid（跨企业唯一，OAuth 时用这个关联到 auth_user.id）
 * - title: 钉钉里的"职位/岗位"字符串（对应 spec 里的 position）
 * - dept_ids: 钉钉允许多部门，存数组
 * - active: 是否在职
 * - raw: 钉钉返回完整 JSON
 */
export const dingtalk_user = pgTable(
  "dingtalk_user",
  {
    user_id: text("user_id").primaryKey(),
    unionid: text("unionid").notNull().unique(),
    name: text("name").notNull(),
    mobile: text("mobile"),
    title: text("title"),
    dept_ids: jsonb("dept_ids").$type<string[]>().notNull().default([]),
    active: boolean("active").notNull().default(true),
    raw: jsonb("raw").notNull(),
    synced_at: timestamp("synced_at").notNull().defaultNow(),
  },
  (t) => ({
    idx_unionid: index("idx_dingtalk_user_unionid").on(t.unionid),
    idx_active: index("idx_dingtalk_user_active").on(t.active),
  }),
);
