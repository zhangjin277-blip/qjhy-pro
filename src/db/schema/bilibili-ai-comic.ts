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

export const bilibili_ai_comic_video_snapshot = pgTable(
  "bilibili_ai_comic_video_snapshot",
  {
    item_id: text("item_id").notNull(),
    snapshot_date: date("snapshot_date").notNull(),
    publish_time: timestamp("publish_time", { withTimezone: true }).notNull(),
    description: text("description"),
    cover_url: text("cover_url"),
    duration_ms: integer("duration_ms"),
    view_count: integer("view_count"),
    like_count: integer("like_count"),
    comment_count: integer("comment_count"),
    share_count: integer("share_count"),
    favorite_count: integer("favorite_count"),
    danmaku_count: integer("danmaku_count"),
    coin_count: integer("coin_count"),
    subscribe_count: integer("subscribe_count"),
    unsubscribe_count: integer("unsubscribe_count"),
    raw: jsonb("raw").notNull().$type<Record<string, unknown>>(),
    collected_at: timestamp("collected_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.item_id, t.snapshot_date] }),
    idx_publish: index("idx_bilibili_ai_comic_publish").on(t.publish_time),
  }),
);
