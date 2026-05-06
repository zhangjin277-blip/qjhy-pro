import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * 线下直播间（物理工位）。
 * 跨平台共用：B17 既可以播抖音也可以播快手。
 * 来源：运营手维护 + PRO3 迁移自动建。
 */
export const live_room = pgTable(
  "live_room",
  {
    id: text("id").primaryKey(), // randomUUID
    room_no: text("room_no").notNull().unique(), // 'B17' / 'A20' / 'B区-09'
    location: text("location"), // 楼层/区域，可空
    status: text("status").notNull().default("active"), // 'active' | 'inactive'
    raw: jsonb("raw").notNull().default({}),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    idx_status: index("idx_live_room_status").on(t.status),
  }),
);
