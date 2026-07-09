import { bigint, bigserial, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { dingtalk_user } from "./dingtalk";

/**
 * 软件库（Software Library）。
 *
 * 全员可下载的工作软件仓库（直播工具/办公软件/剪辑软件/驱动等安装包），
 * 扁平自定义分类，软件名称/版本/说明可自定义。上传走 editing-storage 流式落盘，
 * 物理路径 软件库/{yyyymm}/{md5前12}-{文件名}，与逻辑分类解耦（改分类只改 DB）。
 * MD5 去重：同 hash 未删条目直接复用。
 */

export const software_category = pgTable("software_category", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(), // 分类名，业务唯一（action 层校验）
  sort_order: integer("sort_order").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const software_item = pgTable(
  "software_item",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    category_id: bigint("category_id", { mode: "number" }).references(() => software_category.id, {
      onDelete: "set null",
    }), // NULL = 未分类；分类被硬删时残留引用（含软删条目）自动落回未分类
    name: text("name").notNull(), // 自定义软件名，默认取文件名，可改
    version: text("version"), // 版本号，选填
    note: text("note"), // 一句话说明，选填
    nas_path: text("nas_path").notNull(), // NAS 相对路径（物理位置）
    file_name: text("file_name").notNull(), // 原始文件名
    file_hash: text("file_hash").notNull(), // MD5，去重用
    file_size: bigint("file_size", { mode: "number" }).notNull(), // 字节
    download_count: integer("download_count").notNull().default(0),
    uploaded_by_user_id: text("uploaded_by_user_id").references(() => dingtalk_user.user_id),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }), // 软删
  },
  (t) => ({
    idx_category: index("idx_software_item_category").on(t.category_id),
    idx_hash: index("idx_software_item_hash").on(t.file_hash),
  }),
);
