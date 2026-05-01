import { boolean, index, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { dingtalk_dept, dingtalk_user } from "./dingtalk";

/**
 * 部门负责人（新中台自管，钉钉里没有此概念）。
 * 一个用户可以管多个部门，一个部门可以有多个负责人（联合管理）。
 */
export const dept_leader = pgTable(
  "dept_leader",
  {
    id: serial("id").primaryKey(),
    dept_id: text("dept_id")
      .notNull()
      .references(() => dingtalk_dept.dept_id, { onDelete: "cascade" }),
    user_id: text("user_id")
      .notNull()
      .references(() => dingtalk_user.user_id, { onDelete: "cascade" }),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    unique_dept_user: unique("uq_dept_leader_dept_user").on(t.dept_id, t.user_id),
    idx_user: index("idx_dept_leader_user").on(t.user_id),
  }),
);

/**
 * 岗位默认权限（可在 UI 修改，新岗位通过插入新行添加）。
 */
export const role_default_permission = pgTable("role_default_permission", {
  position: text("position").primaryKey(),
  scope: text("scope", { enum: ["none", "self", "team", "all"] }).notNull(),
  can_edit: boolean("can_edit").notNull().default(false),
  can_export: boolean("can_export").notNull().default(false),
  can_admin: boolean("can_admin").notNull().default(false),
  description: text("description"),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * 个体权限覆盖（最高优先级，需理由）。
 * - scope/can_*: null 表示该字段不覆盖（用 role_default 的值）
 * - reason: 必填，强制说明变更原因
 * - expires_at: 可选过期时间（临时权限）
 */
export const auth_permission_override = pgTable("auth_permission_override", {
  user_id: text("user_id")
    .primaryKey()
    .references(() => dingtalk_user.user_id, { onDelete: "cascade" }),
  scope: text("scope", { enum: ["none", "self", "team", "all"] }),
  can_edit: boolean("can_edit"),
  can_export: boolean("can_export"),
  can_admin: boolean("can_admin"),
  reason: text("reason").notNull(),
  expires_at: timestamp("expires_at"),
  created_by: text("created_by"),
  created_at: timestamp("created_at").notNull().defaultNow(),
});
