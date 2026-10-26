import {
  index,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
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
 * 岗位默认权限（按板块拆分：每岗位 × module 一行）。
 * module 取值：dashboard / anchors / crawler / permissions（见 modules.ts）。
 */
export const role_default_permission = pgTable(
  "role_default_permission",
  {
    position: text("position").notNull(),
    module: text("module").notNull(),
    scope: text("scope", { enum: ["none", "self", "team", "all"] }).notNull(),
    /** 该板块已开通的权限点（板块内短 key 数组，注册表见 modules.ts MODULE_POINTS） */
    points: jsonb("points").$type<string[]>().notNull().default([]),
    description: text("description"),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.position, t.module] }),
    idx_module: index("idx_role_default_module").on(t.module),
  }),
);

/**
 * 项目岗位分配（业务岗位）。
 * 钉钉同步会覆盖 dingtalk_user 整行，所以项目内自定义的岗位指派放独立表。
 * 优先级：user_position_override > dingtalk_user.title > "其他"
 */
export const user_position_override = pgTable("user_position_override", {
  user_id: text("user_id")
    .primaryKey()
    .references(() => dingtalk_user.user_id, { onDelete: "cascade" }),
  position: text("position").notNull(),
  reason: text("reason"),
  assigned_by: text("assigned_by"),
  assigned_at: timestamp("assigned_at").notNull().defaultNow(),
});

/**
 * 个体权限覆盖（最高优先级，需理由）。按板块拆分：每用户 × module 一行。
 * - scope/can_*: null 表示该字段不覆盖（用 role_default 的值）
 * - reason: 必填，强制说明变更原因
 * - expires_at: 可选过期时间（临时权限）
 */
export const auth_permission_override = pgTable(
  "auth_permission_override",
  {
    user_id: text("user_id")
      .notNull()
      .references(() => dingtalk_user.user_id, { onDelete: "cascade" }),
    module: text("module").notNull(),
    scope: text("scope", { enum: ["none", "self", "team", "all"] }),
    /** null = 不覆盖（用岗位默认）；非 null = 整体替换该板块权限点集合 */
    points: jsonb("points").$type<string[] | null>(),
    reason: text("reason").notNull(),
    expires_at: timestamp("expires_at"),
    /**
     * 委托视图：非空时直接以这些员工的 self 视角（agent IN (...)）覆盖 scope。
     * 邀请码注册时从 auth_invite_code.delegated_user_ids 拷过来。
     */
    delegated_user_ids: jsonb("delegated_user_ids").$type<string[] | null>(),
    created_by: text("created_by"),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.user_id, t.module] }),
    idx_module: index("idx_override_module").on(t.module),
  }),
);

/** 独立超级管理员身份，不随钉钉岗位同步变化。 */
export const auth_super_admin = pgTable("auth_super_admin", {
  user_id: text("user_id").primaryKey().references(() => dingtalk_user.user_id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  granted_by: text("granted_by").notNull(),
  created_at: timestamp("created_at").notNull().defaultNow(),
});
