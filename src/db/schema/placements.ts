import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
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
  /** 数据粒度：hourly 为投放数据/20 分钟数据，daily 为捕鱼直播日报汇总。 */
  granularity: text("granularity").$type<"hourly" | "daily">().notNull().default("hourly"),
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

/**
 * 每次 Excel 上传的"原始累计值"（按 subaccount 维度保留）。
 * 用于跨 batch 差分：用户每小时单独上传时，单 batch 内只有 1 行没法做差，
 * 必须把所有历史小时的累计值留着，每次上传后重新算该 (date, dataset, account) 全天的增量到 placement_row。
 */
export const placement_cumulative_raw = pgTable(
  "placement_cumulative_raw",
  {
    date: date("date").notNull(),
    hour: integer("hour").notNull(), // 0-23 起点编号
    dataset_id: text("dataset_id").notNull(),
    live_account_id: text("live_account_id")
      .notNull()
      .references(() => live_account.id),
    subaccount_name: text("subaccount_name").notNull(), // 同 account 下区分广告账户的累计序列
    cost_yuan: numeric("cost_yuan", { precision: 14, scale: 3 }).notNull().default("0"),
    activations: integer("activations").notNull().default(0),
    payment_yuan: numeric("payment_yuan", { precision: 14, scale: 2 }).notNull().default("0"),
    start_download: integer("start_download").notNull().default(0),
    finish_download: integer("finish_download").notNull().default(0),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
    import_batch_id: uuid("import_batch_id").references(() => placement_import_batch.id),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.date, t.hour, t.dataset_id, t.live_account_id, t.subaccount_name],
    }),
    idx_account_date: index("idx_placement_cumulative_account_date").on(
      t.live_account_id,
      t.date,
      t.dataset_id,
    ),
  }),
);
