import { index, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { dingtalk_user } from "./dingtalk";
import { live_room } from "./live-room";

/**
 * 直播账号（核心维度表，跨平台）。
 * 一个账号 = 一个平台直播间账号，有平台 UID、绑定手机、设备编号、所在物理直播间。
 * 来源：运营手维护 + PRO3 迁移导入。
 */
export const live_account = pgTable(
  "live_account",
  {
    id: text("id").primaryKey(), // randomUUID
    account_name: text("account_name").notNull(), // "三国冰河时代-财神"
    platform: text("platform").notNull(), // '抖音' | '快手' | 'B站' | '视频号'
    platform_account_id: text("platform_account_id"), // 抖音号 / 快手号
    platform_uid: text("platform_uid"), // 平台唯一 UID
    platform_real_name: text("platform_real_name"),
    avatar: text("avatar"), // 平台头像 CDN URL（与 anchor_profile.avatar 同风格存原始链接）

    phone: text("phone"),
    phone_index: text("phone_index"), // 'SJ-250421-011' 公司资产编号
    phone_real_name: text("phone_real_name"),

    room_id: text("room_id").references(() => live_room.id),
    game_account_1: text("game_account_1"),
    game_account_2: text("game_account_2"),
    game_account_3: text("game_account_3"),
    product: text("product").notNull(), // '捕鱼大作战' / '三国冰河时代' / ...

    agent_dingtalk_user_id: text("agent_dingtalk_user_id").references(() => dingtalk_user.user_id),

    placement_label: text("placement_label").unique(), // 投放标签 1:1
    live_status: text("live_status").notNull().default("unknown"), // 'living' | 'offline' | 'banned' | 'unknown'

    /** 废弃归档时间（null = 在用）。账号不物理删除，废弃后列表折叠归档、可恢复，历史数据全保留 */
    deprecated_at: timestamp("deprecated_at", { withTimezone: true }),
    deprecated_by_user_id: text("deprecated_by_user_id"),

    raw: jsonb("raw").notNull().default({}),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    idx_deprecated_at: index("idx_live_account_deprecated_at").on(t.deprecated_at),
    unique_platform_uid: unique("uq_live_account_platform_uid").on(t.platform, t.platform_uid),
    idx_platform: index("idx_live_account_platform").on(t.platform),
    idx_product: index("idx_live_account_product").on(t.product),
    idx_agent: index("idx_live_account_agent").on(t.agent_dingtalk_user_id),
    idx_room: index("idx_live_account_room").on(t.room_id),
    idx_platform_account_id: index("idx_live_account_platform_account_id").on(
      t.platform_account_id,
    ),
  }),
);
