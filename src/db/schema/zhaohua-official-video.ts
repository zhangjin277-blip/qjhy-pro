import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  date,
} from "drizzle-orm/pg-core";

/** 抖音创作者中心官号作品的每日快照。 */
export const zhaohua_official_video_snapshot = pgTable(
  "zhaohua_official_video_snapshot",
  {
    item_id: text("item_id").notNull(),
    snapshot_date: date("snapshot_date").notNull(),
    publish_time: timestamp("publish_time", { withTimezone: true }).notNull(),
    description: text("description"),
    cover_url: text("cover_url"),
    duration_ms: integer("duration_ms"),
    visibility: text("visibility"),
    view_count: integer("view_count"),
    like_count: integer("like_count"),
    comment_count: integer("comment_count"),
    share_count: integer("share_count"),
    favorite_count: integer("favorite_count"),
    danmaku_count: integer("danmaku_count"),
    subscribe_count: integer("subscribe_count"),
    unsubscribe_count: integer("unsubscribe_count"),
    avg_view_second: numeric("avg_view_second", { precision: 12, scale: 3 }),
    avg_view_proportion: numeric("avg_view_proportion", { precision: 10, scale: 6 }),
    completion_rate: numeric("completion_rate", { precision: 10, scale: 6 }),
    completion_rate_5s: numeric("completion_rate_5s", { precision: 10, scale: 6 }),
    bounce_rate_2s: numeric("bounce_rate_2s", { precision: 10, scale: 6 }),
    cover_click_rate: numeric("cover_click_rate", { precision: 10, scale: 6 }),
    raw: jsonb("raw").notNull().$type<Record<string, unknown>>(),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.item_id, t.snapshot_date] }),
    idx_publish: index("idx_zhaohua_official_video_publish").on(t.publish_time),
    idx_snapshot: index("idx_zhaohua_official_video_snapshot_date").on(t.snapshot_date),
  }),
);

/** 创作者中心数据中心按日汇总趋势。 */
export const zhaohua_official_video_daily = pgTable("zhaohua_official_video_daily", {
  metric_date: date("metric_date").primaryKey(),
  publish_count: integer("publish_count"),
  play_count: integer("play_count"),
  like_count: integer("like_count"),
  share_count: integer("share_count"),
  comment_count: integer("comment_count"),
  net_fans_count: integer("net_fans_count"),
  cancel_fans_count: integer("cancel_fans_count"),
  homepage_view_count: integer("homepage_view_count"),
  completion_rate_5s: numeric("completion_rate_5s", { precision: 10, scale: 6 }),
  bounce_rate_2s: numeric("bounce_rate_2s", { precision: 10, scale: 6 }),
  cover_click_rate: numeric("cover_click_rate", { precision: 10, scale: 6 }),
  raw: jsonb("raw").notNull().$type<Record<string, unknown>>(),
  collected_at: timestamp("collected_at").notNull().defaultNow(),
});
