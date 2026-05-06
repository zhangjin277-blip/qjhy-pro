import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { auth_user } from "./auth";
import { dingtalk_user } from "./dingtalk";
import { live_account } from "./live-account";

export const placement_import_batch = pgTable("placement_import_batch", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull(),
  file_name: text("file_name"),
  file_size_bytes: integer("file_size_bytes"),
  dataset_id: text("dataset_id").notNull(),
  date_range_from: date("date_range_from"),
  date_range_to: date("date_range_to"),
  row_count: integer("row_count").notNull().default(0),
  rows_inserted: integer("rows_inserted").notNull().default(0),
  rows_updated: integer("rows_updated").notNull().default(0),
  rows_skipped: integer("rows_skipped").notNull().default(0),
  status: text("status").notNull(),
  error_log: jsonb("error_log").$type<{ row?: unknown; reason: string }[] | null>(),
  uploaded_by: text("uploaded_by").references(() => auth_user.id),
  uploaded_at: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const placement_row = pgTable(
  "placement_row",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull(),
    hour: integer("hour").notNull(),
    dataset_id: text("dataset_id").notNull(),
    // ⚠️ live_account.id 是 TEXT（不是 UUID），所以这里也是 text 而非 uuid
    live_account_id: text("live_account_id")
      .notNull()
      .references(() => live_account.id),

    cost_yuan: numeric("cost_yuan", { precision: 14, scale: 3 }).notNull().default("0"),
    activations: integer("activations").notNull().default(0),
    payment_yuan: numeric("payment_yuan", { precision: 14, scale: 2 }).notNull().default("0"),
    start_download: integer("start_download").notNull().default(0),
    finish_download: integer("finish_download").notNull().default(0),

    attributed_dingtalk_user_id: text("attributed_dingtalk_user_id").references(
      () => dingtalk_user.user_id,
    ),
    attribution_dirty: boolean("attribution_dirty").notNull().default(true),
    attribution_computed_at: timestamp("attribution_computed_at", { withTimezone: true }),
    attribution_source: text("attribution_source").$type<
      "override" | "default" | "conflict" | "unmatched" | null
    >(),

    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
    import_batch_id: uuid("import_batch_id").references(() => placement_import_batch.id),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqRow: unique("placement_row_unique_key").on(t.date, t.hour, t.dataset_id, t.live_account_id),
  }),
);
