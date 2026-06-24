import {
  bigint,
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { dingtalk_user } from "./dingtalk";

/**
 * 素材库（Material Library）。
 *
 * 剪辑师上传的通用游戏素材（视频/音频/图片），按目录树归档，可检索复用。
 * 与 editing_task（一次性任务流水）独立建模 —— 素材库是常驻可复用资产。
 *
 * 设计要点：
 *  - 目录自由嵌套：material_folder.parent_id 自关联，NULL = 顶层。
 *  - 物理路径与逻辑目录解耦：nas_path 用扁平规则 素材库/{type}/{yyyymm}/{md5前12}-{name}，
 *    移动/改名目录只改 folder_id（DB），不动 NAS 文件。
 *  - MD5 去重：上传时按 file_hash 查重，命中则复用已有素材。
 */

export const MATERIAL_TYPES = ["video", "audio", "image"] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];

export const material_folder = pgTable(
  "material_folder",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    // 自关联父目录，NULL = 顶层。不加 .references(自表) 以避免 Drizzle 自引用循环类型问题，
    // 删空目录由 action 保证一致性。
    parent_id: bigint("parent_id", { mode: "number" }),
    sort_order: integer("sort_order").notNull().default(0),
    created_by_user_id: text("created_by_user_id").references(() => dingtalk_user.user_id),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    idx_parent: index("idx_material_folder_parent").on(t.parent_id),
  }),
);

export const material_asset = pgTable(
  "material_asset",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    folder_id: bigint("folder_id", { mode: "number" }).references(() => material_folder.id),
    name: text("name").notNull(), // 素材名，默认取文件名，可改
    type: text("type", { enum: MATERIAL_TYPES }).notNull(),
    nas_path: text("nas_path").notNull(), // NAS 相对路径（物理位置）
    file_name: text("file_name").notNull(), // 原始文件名
    file_hash: text("file_hash").notNull(), // MD5，去重用
    file_size: bigint("file_size", { mode: "number" }).notNull(), // 字节
    format: text("format"), // 容器/扩展名：mp4 / wav / png
    duration_sec: integer("duration_sec"), // 视频/音频时长（图片为 null）
    width: integer("width"),
    height: integer("height"),
    cover_path: text("cover_path"), // 缩略图相对路径（二期生成，MVP 为 null）
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    download_count: integer("download_count").notNull().default(0), // 「使用次数」= 累计下载
    uploaded_by_user_id: text("uploaded_by_user_id").references(() => dingtalk_user.user_id),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }), // 软删
  },
  (t) => ({
    idx_folder: index("idx_material_asset_folder").on(t.folder_id, t.type),
    idx_type: index("idx_material_asset_type").on(t.type),
    idx_hash: index("idx_material_asset_hash").on(t.file_hash),
  }),
);

/** 素材收藏（user × asset 多对多）。 */
export const material_favorite = pgTable(
  "material_favorite",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    asset_id: bigint("asset_id", { mode: "number" })
      .notNull()
      .references(() => material_asset.id, { onDelete: "cascade" }),
    user_id: text("user_id")
      .notNull()
      .references(() => dingtalk_user.user_id),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uq_fav: unique("uq_material_favorite").on(t.asset_id, t.user_id),
    idx_user: index("idx_material_favorite_user").on(t.user_id),
  }),
);
