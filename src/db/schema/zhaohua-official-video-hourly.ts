import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/** 抖音作品详情页返回的小时趋势点。累计值按点保存，新增值由查询层计算。 */
export const zhaohua_official_video_hourly = pgTable(
  "zhaohua_official_video_hourly",
  {
    item_id: text("item_id").notNull(),
    metric_type: integer("metric_type").notNull(),
    point_at: timestamp("point_at", { withTimezone: true }).notNull(),
    value: numeric("value", { precision: 20, scale: 6 }).notNull(),
    raw: jsonb("raw").notNull().$type<Record<string, unknown>>(),
    collected_at: timestamp("collected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.item_id, t.metric_type, t.point_at] }),
    idx_item_metric: index("idx_zhaohua_official_video_hourly_metric").on(
      t.item_id,
      t.metric_type,
      t.point_at,
    ),
  }),
);
