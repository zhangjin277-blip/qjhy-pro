import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * 元信息表 - 用于健康检查和 schema 版本追踪。
 * 不是业务表，仅记录"系统状态"。
 */
export const _meta = pgTable("_meta", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});
