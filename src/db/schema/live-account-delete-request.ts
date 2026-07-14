import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { dingtalk_user } from "./dingtalk";

/**
 * 直播账号删除申请（审核流）。
 *
 * 背景：2026-07-14 一线用「删除重建」换直播间，deleteAccount 连带硬删了
 * 账号名下全部剪辑任务/开播记录。此后非管理员删除账号必须提交申请，
 * 由 live_account 板块 can_admin（张锦）审核批准后才真正执行删除。
 *
 * 设计要点：
 *  - account_id 不加 FK：批准后账号行被物理删除，申请记录必须留档可查。
 *  - account_snapshot 存申请时的账号完整行；impact 存连带数据统计，
 *    审核人批准时看到的就是这份数字。
 *  - 每账号同时只允许一条 pending（部分唯一索引在手写 migration 里）。
 */

export const DELETE_REQUEST_STATUS = ["pending", "approved", "rejected", "cancelled"] as const;
export type DeleteRequestStatus = (typeof DELETE_REQUEST_STATUS)[number];

export interface DeleteImpact {
  editing_tasks: number;
  live_sessions: number;
  placement_rows: number;
  schedule_items: number; // override + 默认排班日/段合计
  anchor_bindings: number;
}

export const live_account_delete_request = pgTable(
  "live_account_delete_request",
  {
    id: text("id").primaryKey(), // randomUUID
    account_id: text("account_id").notNull(),
    account_name: text("account_name").notNull(), // 冗余存名，账号删除后仍可展示
    product: text("product").notNull(),
    account_snapshot: jsonb("account_snapshot").notNull(),
    impact: jsonb("impact").$type<DeleteImpact>().notNull(),
    reason: text("reason"),
    status: text("status", { enum: DELETE_REQUEST_STATUS }).notNull().default("pending"),
    requested_by_user_id: text("requested_by_user_id")
      .notNull()
      .references(() => dingtalk_user.user_id),
    requested_at: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    reviewed_by_user_id: text("reviewed_by_user_id").references(() => dingtalk_user.user_id),
    reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
    review_note: text("review_note"),
  },
  (t) => ({
    idx_status: index("idx_account_delete_request_status").on(t.status, t.requested_at),
    idx_account: index("idx_account_delete_request_account").on(t.account_id),
  }),
);
