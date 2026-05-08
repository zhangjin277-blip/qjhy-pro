import { boolean, date, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { auth_user } from "./auth";
import { dingtalk_user } from "./dingtalk";
import { live_account } from "./live-account";

export const daily_schedule_segment = pgTable(
  "daily_schedule_segment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    account_id: text("account_id")
      .notNull()
      .references(() => live_account.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    dingtalk_user_id: text("dingtalk_user_id")
      .notNull()
      .references(() => dingtalk_user.user_id),
    start_hour: integer("start_hour").notNull(),
    end_hour: integer("end_hour").notNull(),
    is_rest: boolean("is_rest").notNull().default(false),
    source: text("source").notNull().default("manual"),
    reason: text("reason"),
    created_by: text("created_by").references(() => auth_user.id),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    accountDateIdx: index("daily_schedule_segment_account_date_idx").on(t.account_id, t.date),
    userDateIdx: index("daily_schedule_segment_user_date_idx").on(t.dingtalk_user_id, t.date),
  }),
);
