import { date, index, integer, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { dingtalk_user } from "./dingtalk";

export const PROCUREMENT_STATUSES = ["pending_approval", "pending", "purchased", "shipped", "received", "returned", "rejected"] as const;
export type ProcurementStatus = (typeof PROCUREMENT_STATUSES)[number];

export const procurement_item = pgTable("procurement_item", {
  id: serial("id").primaryKey(),
  item_name: text("item_name").notNull(), price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
  quantity: integer("quantity").notNull().default(1), platform: text("platform"), link: text("link"), screenshot: text("screenshot"),
  requester: text("requester"), anchor_name: text("anchor_name"), room: text("room"), usage: text("usage"), remarks: text("remarks"), invoice: text("invoice").default("可开票"),
  status: text("status", { enum: PROCUREMENT_STATUSES }).notNull().default("pending_approval"), order_id: text("order_id"), tracking_no: text("tracking_no"), shop_name: text("shop_name"),
  actual_price: numeric("actual_price", { precision: 12, scale: 2 }), return_reason: text("return_reason"), refund_amount: numeric("refund_amount", { precision: 12, scale: 2 }).default("0"),
  submitter_user_id: text("submitter_user_id").references(() => dingtalk_user.user_id), submitter: text("submitter"), submitter_team_id: text("submitter_team_id"),
  approver_user_id: text("approver_user_id").references(() => dingtalk_user.user_id), approver_name: text("approver_name"), approval_remark: text("approval_remark"), approval_date: date("approval_date", { mode: "string" }),
  submission_date: date("submission_date", { mode: "string" }), purchase_date: date("purchase_date", { mode: "string" }), received_date: date("received_date", { mode: "string" }), return_date: date("return_date", { mode: "string" }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ status: index("idx_procurement_item_status").on(t.status), created: index("idx_procurement_item_created").on(t.created_at) }));

export const procurement_log = pgTable("procurement_log", {
  id: serial("id").primaryKey(), item_id: integer("item_id").notNull().references(() => procurement_item.id, { onDelete: "cascade" }), action: text("action").notNull(),
  from_status: text("from_status"), to_status: text("to_status"), operator_user_id: text("operator_user_id").references(() => dingtalk_user.user_id), operator: text("operator"), remark: text("remark"), created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ item: index("idx_procurement_log_item").on(t.item_id) }));
