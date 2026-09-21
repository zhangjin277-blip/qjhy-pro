import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const wechat_ai_comic_video_snapshot = pgTable(
  "wechat_ai_comic_video_snapshot",
  {
    item_id: text("item_id").notNull(),
    snapshot_date: date("snapshot_date").notNull(),
    publish_time: timestamp("publish_time", { withTimezone: true }).notNull(),
    description: text("description"),
    cover_url: text("cover_url"),
    view_count: integer("view_count"),
    like_count: integer("like_count"),
    comment_count: integer("comment_count"),
    share_count: integer("share_count"),
    subscribe_count: integer("subscribe_count"),
    raw: jsonb("raw").notNull().$type<Record<string, unknown>>(),
    collected_at: timestamp("collected_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.item_id, t.snapshot_date] }),
    idx_publish: index("idx_wechat_ai_comic_publish").on(t.publish_time),
  }),
);

export const wechat_ai_comic_daily = pgTable("wechat_ai_comic_daily", {
  metric_date: date("metric_date").primaryKey(),
  publish_count: integer("publish_count"),
  play_count: integer("play_count"),
  like_count: integer("like_count"),
  comment_count: integer("comment_count"),
  share_count: integer("share_count"),
  net_fans_count: integer("net_fans_count"),
  raw: jsonb("raw").notNull().$type<Record<string, unknown>>(),
  collected_at: timestamp("collected_at").notNull().defaultNow(),
});
