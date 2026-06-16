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
    platform: text("platform").notNull().default("douyin"), // 'douyin' | 'kuaishou'
    name: text("name").notNull(),
    columns: jsonb("columns").notNull().$type<string[]>(),
    project: text("project").notNull().default("all"),
    // 经纪人筛选快照（抖音运营/招募经纪人多选）；null = 不带筛选。快手预设恒 null
    broker_filter: jsonb("broker_filter").$type<{
      operate: string[];
      recruit: string[];
    } | null>(),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    // 同一用户同一 platform 内 name 唯一（跨 platform 可同名）
    unique_user_platform_name: unique("uq_user_column_preset_user_platform_name").on(
      t.dingtalk_user_id,
      t.platform,
      t.name,
    ),
    idx_user_platform: index("idx_user_column_preset_user_platform").on(
      t.dingtalk_user_id,
      t.platform,
    ),
  }),
);
