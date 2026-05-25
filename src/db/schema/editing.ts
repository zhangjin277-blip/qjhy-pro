import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * 产品分类配置（PK = product name，与 live_account.product join）。
 * MVP 不做管理 UI，由 seed 初始化。
 */
export const product_config = pgTable("product_config", {
  product_name: text("product_name").primaryKey(), // "捕鱼大作战" / "途游斗地主" / ...
  display_short: text("display_short").notNull(), // 看板 chip 简称："捕鱼"
  accent_color: text("accent_color").notNull(), // hex，看板色带
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
