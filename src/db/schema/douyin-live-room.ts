import { bigint, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * 抖音公会后台「正在直播」快照（union /ark/api/broker/follow/get_room_by_label）。
 * 一行 = 一场直播（room_id 唯一）。5min job upsert：首次写 start_at（create_time），
 * 后续刷新 ticket/user_count + last_seen_at。
 * 「当前在播」= last_seen_at 在最近 15 分钟内。历史行保留 = 抖音场次沉淀。
 * 映射：platform_uid = live_account.platform_uid（owner.user_id_str）。
 */
export const douyin_live_room = pgTable(
  "douyin_live_room",
  {
    room_id: text("room_id").primaryKey(), // id_str
    platform_uid: text("platform_uid").notNull(), // owner.user_id_str
    nick_name: text("nick_name"),
    title: text("title"),
    start_at: timestamp("start_at", { withTimezone: true }).notNull(), // create_time
    ticket_count: bigint("ticket_count", { mode: "number" }),
    user_count: integer("user_count"),
    first_seen_at: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    last_seen_at: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    raw: jsonb("raw").notNull().default({}),
  },
  (t) => ({
    idx_uid: index("idx_douyin_live_room_uid").on(t.platform_uid),
    idx_last_seen: index("idx_douyin_live_room_last_seen").on(t.last_seen_at),
    idx_start: index("idx_douyin_live_room_start").on(t.start_at),
  }),
);
