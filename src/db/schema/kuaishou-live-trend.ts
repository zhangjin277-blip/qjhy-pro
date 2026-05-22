import { bigint, index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * 快手 666 机构后台 trend 接口的累计分时点。
 * 单接口拿一场直播开播到当前的全部 1 分钟分时累计。
 *
 * 字段对应 666 API：
 *   live_stream_id_str ← payload.liveStreamId（"n4qImNF2Bf0" 字符串 ID）
 *   member_id          ← 关联 live_account.platform_account_id（主播 quora ID）
 *   ts                 ← trendData[i].time（毫秒 → timestamptz）
 *   valid_income_cents ← SUM_VALID_INCOME × 100（累计有效收入）
 *   online_count       ← ONLINE_COUNT（当下在线，非累计）
 *   bullet/like/share  ← SUM_BULLET/LIKE/SHARE_COUNT（累计）
 *
 * 计算主播班次流水：MAX(income) - MIN(income) GROUP BY live_stream_id_str，
 * 时间窗用 live_session_log 的 [start_at, COALESCE(end_at, now())]。
 */
export const kuaishou_live_trend = pgTable(
  "kuaishou_live_trend",
  {
    live_stream_id_str: text("live_stream_id_str").notNull(),
    member_id: text("member_id").notNull(),
    member_name: text("member_name"),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    valid_income_cents: bigint("valid_income_cents", { mode: "number" }).notNull().default(0),
    online_count: integer("online_count"),
    bullet_count: bigint("bullet_count", { mode: "number" }),
    like_count: bigint("like_count", { mode: "number" }),
    share_count: bigint("share_count", { mode: "number" }),
    fetched_at: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.live_stream_id_str, t.ts] }),
    idx_member_ts: index("idx_ks_trend_member_ts").on(t.member_id, t.ts),
    idx_ts: index("idx_ks_trend_ts").on(t.ts),
  }),
);
