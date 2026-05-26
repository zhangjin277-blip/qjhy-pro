import {
  bigint,
  bigserial,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { anchor_profile } from "./anchors";
import { dingtalk_user } from "./dingtalk";
import { live_account } from "./live-account";

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

// ─── 剪辑任务 ────────────────────────────────────────────────────────────────

export const EDITING_TASK_STATUS = ["uploaded", "editing", "review", "ready", "published"] as const;
export type EditingTaskStatus = (typeof EDITING_TASK_STATUS)[number];

export const EDITING_TASK_PRIORITY = ["normal", "urgent"] as const;
export type EditingTaskPriority = (typeof EDITING_TASK_PRIORITY)[number];

export const editing_task = pgTable(
  "editing_task",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    live_account_id: text("live_account_id")
      .notNull()
      .references(() => live_account.id),
    anchor_id: text("anchor_id").references(() => anchor_profile.anchor_id),
    material_date: timestamp("material_date", { mode: "date", withTimezone: false }).notNull(),
    status: text("status", { enum: EDITING_TASK_STATUS }).notNull(),
    source_remark: text("source_remark"),
    source_files: jsonb("source_files").$type<string[]>().notNull().default([]),
    source_file_names: jsonb("source_file_names").$type<string[]>().notNull().default([]),
    source_uploaded_at: timestamp("source_uploaded_at", { withTimezone: true }),
    editor_user_id: text("editor_user_id").references(() => dingtalk_user.user_id),
    editing_started_at: timestamp("editing_started_at", { withTimezone: true }),
    edited_files: jsonb("edited_files").$type<string[]>().notNull().default([]),
    edited_file_names: jsonb("edited_file_names").$type<string[]>().notNull().default([]),
    edited_uploaded_at: timestamp("edited_uploaded_at", { withTimezone: true }),
    reviewed_by_user_id: text("reviewed_by_user_id").references(() => dingtalk_user.user_id),
    reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
    published_by_user_id: text("published_by_user_id").references(() => dingtalk_user.user_id),
    published_at: timestamp("published_at", { withTimezone: true }),
    video_id: text("video_id"),
    created_by_user_id: text("created_by_user_id")
      .notNull()
      .references(() => dingtalk_user.user_id),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    priority: text("priority", { enum: EDITING_TASK_PRIORITY }).notNull().default("normal"),
    urgent_reason: text("urgent_reason"),
    is_disqualified: boolean("is_disqualified").notNull().default(false),
    disqualified_reason: text("disqualified_reason"),
    disqualified_by_user_id: text("disqualified_by_user_id").references(
      () => dingtalk_user.user_id,
    ),
    disqualified_at: timestamp("disqualified_at", { withTimezone: true }),
  },
  (t) => ({
    idx_status_date: index("idx_editing_task_status_date").on(t.status, t.material_date),
    idx_account_date: index("idx_editing_task_account_date").on(t.live_account_id, t.material_date),
    idx_editor_status: index("idx_editing_task_editor_status").on(t.editor_user_id, t.status),
    idx_video_id: index("idx_editing_task_video_id").on(t.video_id),
  }),
);

export const EDITING_EVENT_TYPES = [
  "created",
  "source_uploaded",
  "assigned",
  "reassigned",
  "editing_reset",
  "edited_uploaded",
  "review_approved",
  "review_rejected",
  "published",
  "deleted",
  "disqualified",
  "disqualified_undone",
  "priority_changed",
] as const;
export type EditingEventType = (typeof EDITING_EVENT_TYPES)[number];

export const editing_task_event = pgTable(
  "editing_task_event",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    task_id: bigint("task_id", { mode: "number" })
      .notNull()
      .references(() => editing_task.id, { onDelete: "cascade" }),
    event_type: text("event_type", { enum: EDITING_EVENT_TYPES }).notNull(),
    actor_user_id: text("actor_user_id")
      .notNull()
      .references(() => dingtalk_user.user_id),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idx_task_created: index("idx_editing_event_task_created").on(t.task_id, t.created_at),
    idx_type_created: index("idx_editing_event_type_created").on(t.event_type, t.created_at),
  }),
);
