import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { dingtalk_user } from "./dingtalk";

/**
 * 邀请码（注册凭证）。
 *
 * - code: 6 位短码（人工可口播/转发），加项目前缀展示为 "QJHY-XXXXXX"
 * - perms: 注册成功后写入 auth_permission_override 的权限模板（按 module 数组）
 * - max_uses: 默认 1（一次性）；可设 N（团队邀请，多人同码注册）
 * - used_count: 已用次数；达到 max_uses 自动失效
 * - expires_at: 可选过期；null=永不过期
 * - revoked_at: admin 主动撤销
 * - account_expire_at: 用此码注册出来的账号的有效期（null=永久）
 */
export const auth_invite_code = pgTable(
  "auth_invite_code",
  {
    code: text("code").primaryKey(),
    perms: jsonb("perms")
      .$type<
        {
          module: string;
          scope: "none" | "self" | "team" | "all";
          can_edit: boolean;
          can_export: boolean;
          can_admin: boolean;
        }[]
      >()
      .notNull(),
    max_uses: integer("max_uses").notNull().default(1),
    used_count: integer("used_count").notNull().default(0),
    expires_at: timestamp("expires_at"),
    account_expire_at: timestamp("account_expire_at"),
    revoked_at: timestamp("revoked_at"),
    /**
     * 委托视图：注册成功后，写入每个 module 的 override.delegated_user_ids。
     * 效果 = "代这些员工的 self 视角"，覆盖该 module 的 scope。
     * null/空 → 不启用委托，按原 scope 走。
     */
    delegated_user_ids: jsonb("delegated_user_ids").$type<string[] | null>(),
    note: text("note"),
    created_by: text("created_by").references(() => dingtalk_user.user_id, {
      onDelete: "set null",
    }),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    idx_revoked: index("idx_invite_code_revoked").on(t.revoked_at),
    idx_created_by: index("idx_invite_code_created_by").on(t.created_by),
  }),
);

/**
 * 邀请码使用记录（审计用：哪个码注册了哪个用户）。
 */
export const auth_invite_code_use = pgTable(
  "auth_invite_code_use",
  {
    id: text("id").primaryKey(),
    code: text("code")
      .notNull()
      .references(() => auth_invite_code.code, { onDelete: "cascade" }),
    auth_user_id: text("auth_user_id").notNull(),
    dingtalk_user_id: text("dingtalk_user_id").notNull(),
    used_at: timestamp("used_at").notNull().defaultNow(),
  },
  (t) => ({
    idx_code: index("idx_invite_code_use_code").on(t.code),
    idx_auth_user: index("idx_invite_code_use_auth_user").on(t.auth_user_id),
  }),
);
