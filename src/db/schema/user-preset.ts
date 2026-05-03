import { index, pgTable, serial, text, timestamp, unique, jsonb } from "drizzle-orm/pg-core";

/**
 * 用户自定义列预设。
 *
 * - 内置预设（斗地主默认 / 三国默认 / 公会管理 / 全部）由前端代码硬编码，**不入库**
 * - 用户保存的预设进这张表，每用户独立、互不可见
 * - dingtalk_user_id 存钉钉 user_id（与 anchors 等其他表保持一致；不加 FK 以容忍用户删除）
 * - columns 是 ColKey 字符串数组，按用户拖动后的顺序保存
 * - 同一用户内 name 唯一
 */
export const user_column_preset = pgTable(
  "user_column_preset",
  {
    id: serial("id").primaryKey(),
    dingtalk_user_id: text("dingtalk_user_id").notNull(),
    name: text("name").notNull(),
    columns: jsonb("columns").notNull().$type<string[]>(),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    unique_user_name: unique("uq_user_column_preset_user_name").on(t.dingtalk_user_id, t.name),
    idx_user: index("idx_user_column_preset_user").on(t.dingtalk_user_id),
  }),
);
