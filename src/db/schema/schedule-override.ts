import { date, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { auth_user } from "./auth";
import { dingtalk_user } from "./dingtalk";
import { live_account } from "./live-account";

export const schedule_override = pgTable(
  "schedule_override",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // ⚠️ live_account.id 是 TEXT
    account_id: text("account_id")
      .notNull()
      .references(() => live_account.id),
    date: date("date").notNull(),
    dingtalk_user_id: text("dingtalk_user_id")
      .notNull()
      .references(() => dingtalk_user.user_id),
    time_slots: jsonb("time_slots").$type<[string, string][]>().notNull(),
    reason: text("reason"),
    created_by: text("created_by").references(() => auth_user.id),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqOverride: unique("schedule_override_unique_key").on(
      t.account_id,
      t.date,
      t.dingtalk_user_id,
    ),
  }),
);
