import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * 爬虫 Cookie 储存。
 * Phase 2 仅 cs 一个 basecamp，单行；后续扩 nc1/nc2 时多行即可。
 * Cookie 失效 status='expired' → 队列暂停 → 钉钉告警 → admin 扫码续期重置 active。
 */
export const crawler_cookie_session = pgTable("crawler_cookie_session", {
  basecamp: text("basecamp", { enum: ["cs", "nc1", "nc2"] }).primaryKey(),
  cookies: jsonb("cookies").notNull().$type<Record<string, string>>(), // {sid_guard, sessionid, msToken, ttwid, passport_csrf_token, ...}
  captured_at: timestamp("captured_at").notNull().defaultNow(),
  expires_at: timestamp("expires_at"),
  status: text("status", { enum: ["active", "expired"] })
    .notNull()
    .default("active"),
  last_check_at: timestamp("last_check_at"),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * 字段中文显示名 + 单位 + 显示控制。
 * 仅"展示层"配置——不影响存储/采集。
 * 主键 (table_name, field_name) 全局唯一。
 */
export const field_alias = pgTable(
  "field_alias",
  {
    table_name: text("table_name").notNull(),
    field_name: text("field_name").notNull(),
    chinese_name: text("chinese_name").notNull(),
    unit: text("unit"), // 小时 / 分 / 元 / % / null
    hidden: boolean("hidden").notNull().default(false),
    sort_order: integer("sort_order").notNull().default(0),
    description: text("description"),
    updated_by: text("updated_by"),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.table_name, t.field_name] }),
    idx_table: index("idx_field_alias_table").on(t.table_name),
  }),
);
