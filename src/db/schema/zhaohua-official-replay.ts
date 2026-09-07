import {
  bigint,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/** 抖音灵机「造化仙府丨孙小圣」下播复盘，一行一场。 */
export const zhaohua_official_replay = pgTable(
  "zhaohua_official_replay",
  {
    room_id: text("room_id").primaryKey(),
    account_name: text("account_name").notNull().default("造化仙府丨孙小圣"),
    title: text("title"),
    started_at: timestamp("started_at", { withTimezone: true }).notNull(),
    ended_at: timestamp("ended_at", { withTimezone: true }),
    duration_seconds: integer("duration_seconds"),

    exposure_uv: bigint("exposure_uv", { mode: "number" }),
    enter_room_uv: bigint("enter_room_uv", { mode: "number" }),
    enter_room_rate: doublePrecision("enter_room_rate"),
    avg_online: doublePrecision("avg_online"),
    peak_online: integer("peak_online"),
    avg_watch_seconds: integer("avg_watch_seconds"),
    sound_wave: bigint("sound_wave", { mode: "number" }),
    gift_users: integer("gift_users"),
    new_followers: integer("new_followers"),
    comment_users: integer("comment_users"),
    like_count: bigint("like_count", { mode: "number" }),
    share_count: integer("share_count"),
    fan_club_users: integer("fan_club_users"),
    game_revenue: doublePrecision("game_revenue"),
    game_activations: integer("game_activations"),
    game_purchases: integer("game_purchases"),

    base_raw: jsonb("base_raw").notNull().default({}),
    overview_raw: jsonb("overview_raw").notNull().default({}),
    game_raw: jsonb("game_raw").notNull().default({}),
    history_raw: jsonb("history_raw").notNull().default({}),
    synced_at: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    startedAtIdx: index("idx_zhaohua_official_replay_started_at").on(table.started_at),
  }),
);
