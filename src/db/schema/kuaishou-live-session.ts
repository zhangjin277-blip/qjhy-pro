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
import { kuaishou_member } from "./kuaishou-member";

/**
 * 快手公会主播单场直播数据。
 *
 * 双数据源融合 + data_source 标识：
 *   - today/list（实时，每 30min 同步）   → data_source='today'，含推广 / 画像（today_extra）
 *   - history/list（权威，每日凌晨同步） → data_source='history'，73 字段全补
 *
 * 同一 live_stream_id：先有 today 记录（粗），后被 history UPSERT 覆盖（精+齐）。
 * today_extra（推广/画像/分级）从 today 继承，history 不覆盖（保留）。
 *
 * 字段按业务分组（注释 // 流量 / // 涨粉 …）。所有指标列允许 null：
 *   - today 同步时只填 today→history 映射上的字段
 *   - history 同步时全部 73 字段补齐
 */
export const kuaishou_live_session = pgTable(
  "kuaishou_live_session",
  {
    // ── 基础 ─────────────────────────────────────────────────────
    live_stream_id: bigint("live_stream_id", { mode: "bigint" }).primaryKey(),
    member_id: text("member_id")
      .notNull()
      .references(() => kuaishou_member.user_id),
    member_name: text("member_name"),
    head_img: text("head_img"),
    broker_id: bigint("broker_id", { mode: "bigint" }),
    broker_name: text("broker_name"),
    fans_cnt: integer("fans_cnt"),
    live_type: text("live_type"), // history: "游戏" / today: "game"（保留原文）
    title: text("title"),
    cover_url: text("cover_url"),
    live_detail: text("live_detail"), // m3u8 回放

    // ── 时间 ─────────────────────────────────────────────────────
    start_datetime: timestamp("start_datetime").notNull(),
    end_datetime: timestamp("end_datetime"),
    live_duration_text: text("live_duration_text"), // history "11小时8分钟"
    live_duration_ms: bigint("live_duration_ms", { mode: "number" }),

    // ── 流量 ─────────────────────────────────────────────────────
    play_uv: integer("play_uv"), // 有效观看人数（去重）— history 独有
    play_user_cnt: integer("play_user_cnt"), // 总观看次数（含重复）— today.totalOnlineNum
    max_concurrent_user_num: integer("max_concurrent_user_num"), // 峰值在线 — today.maxOnlineNum
    valid_acu: doublePrecision("valid_acu"), // 有效平均在线 — today.acu
    play_rate: text("play_rate"), // 有效观看率 "31.45%" — history 独有
    per_play_time_avg_text: text("per_play_time_avg_text"), // history "6分钟49秒"
    per_play_time_avg_ms: bigint("per_play_time_avg_ms", { mode: "number" }), // — today.avgOnlineDuration
    valid_play_duration_avg_text: text("valid_play_duration_avg_text"), // history "2分钟15秒"
    live_cover_ctr: text("live_cover_ctr"), // 封面点击率（history 部分场次有）

    // ── 涨粉 / 转化 ─────────────────────────────────────────────
    add_fans_cnt: integer("add_fans_cnt"), // 净涨粉 — history 独有
    follow_author_num: integer("follow_author_num"), // 直播关注 — history 独有
    cancel_follow_author_num: integer("cancel_follow_author_num"), // 直播取关
    transfer_fans_rate: text("transfer_fans_rate"), // 转粉率 "0.27%" — history 独有
    fans_club_cnt: integer("fans_club_cnt"), // 粉丝团总数

    // ── 互动 ─────────────────────────────────────────────────────
    like_cnt: integer("like_cnt"),
    like_rate: text("like_rate"), // "86.52%"
    like_uv: integer("like_uv"),
    comment_cnt: integer("comment_cnt"),
    comment_rate: text("comment_rate"),
    comment_uv: integer("comment_uv"),
    share_cnt: integer("share_cnt"),
    share_rate: text("share_rate"),
    share_uv: integer("share_uv"),
    interact_num: integer("interact_num"),
    interact_rate: text("interact_rate"),

    // ── 送礼营收 ────────────────────────────────────────────────
    send_gift_uv: integer("send_gift_uv"),
    sent_gift_cnt: integer("sent_gift_cnt"),
    live_amt: doublePrecision("live_amt"), // 直播总流水（元）
    live_video_amt: doublePrecision("live_video_amt"),
    live_chat_room_amt: doublePrecision("live_chat_room_amt"),

    // ── 违规 ─────────────────────────────────────────────────────
    report_num: integer("report_num"),
    report_rate: text("report_rate"),

    // ── today 独有：推广 / 画像 / 主播分级（17 字段，整体 jsonb） ──
    today_extra: jsonb("today_extra"), // { promoteAmt, promoteCost, ..., fansMostAge, fansMaleRate, authorType, ratio, hasPromote, hasPunish, settleProvince, ... }

    // ── 元数据 ───────────────────────────────────────────────────
    data_source: text("data_source").notNull(), // 'today' | 'history'
    raw: jsonb("raw").notNull().default({}), // 完整 API 响应（兜底，将来加字段不用爬）
    synced_at: timestamp("synced_at").notNull().defaultNow(),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    idx_member: index("idx_kuaishou_live_session_member").on(t.member_id),
    idx_start: index("idx_kuaishou_live_session_start").on(t.start_datetime),
    idx_member_start: index("idx_kuaishou_live_session_member_start").on(
      t.member_id,
      t.start_datetime,
    ),
    idx_data_source: index("idx_kuaishou_live_session_data_source").on(t.data_source),
  }),
);
