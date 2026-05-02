import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * 主播档案（维度表）。
 * 来源：抖音 uanchor/anchor_list/list（117 字段，解构 6 个嵌套对象后落 48 个扁平字段）
 * 更新：每日 10:00 全量同步覆盖（不存历史快照）
 * 详细字段映射见 .tmp-design-preview/anchor-tables-fields-final.md
 */
export const anchor_profile = pgTable(
  "anchor_profile",
  {
    anchor_id: text("anchor_id").primaryKey(),

    // 身份/基础（10）
    nick_name: text("nick_name").notNull(),
    avatar: text("avatar"),
    gender: integer("gender"), // 0=未知, 1=男, 2=女（抖音平台编码）
    aweme_display_id: text("aweme_display_id"),
    aweme_short_id: text("aweme_short_id"),
    hotsoon_display_id: text("hotsoon_display_id"),
    hotsoon_short_id: text("hotsoon_short_id"),
    xigua_display_id: text("xigua_display_id"),
    real_name: text("real_name"),

    // 状态/标签（7）
    last_live_time: bigint("last_live_time", { mode: "number" }), // unix
    live_status: integer("live_status"), // 0=未直播, 1=直播中（抖音平台编码）
    anchor_health_score: integer("anchor_health_score"),
    anchor_health_score_level: integer("anchor_health_score_level"), // 健康分等级（1=最高，递增数字代表更低等级，具体含义平台未公开）
    anchor_ban_30d: integer("anchor_ban_30d"), // 风控指标 — 近 30 天封禁次数
    anchor_violation_30d: integer("anchor_violation_30d"), // 风控指标 — 近 30 天违规次数
    notes: text("notes"),

    // 签约/经纪人（13）
    anchor_sign_type: integer("anchor_sign_type"),
    anchor_sign_out: integer("anchor_sign_out"),
    signing_time: bigint("signing_time", { mode: "number" }),
    sign_start_time: bigint("sign_start_time", { mode: "number" }),
    sign_end_time: bigint("sign_end_time", { mode: "number" }),
    union_member_end_date: bigint("union_member_end_date", { mode: "number" }),
    auto_renewal: boolean("auto_renewal"),
    join_time: bigint("join_time", { mode: "number" }),
    first_live_time_in_faction: bigint("first_live_time_in_faction", { mode: "number" }),
    leave_time: bigint("leave_time", { mode: "number" }),
    wait_for_leave: boolean("wait_for_leave"),
    have_operate_relation: boolean("have_operate_relation"),
    have_recruit_relation: boolean("have_recruit_relation"),

    // 经纪人关系（4）
    broker_id: text("broker_id"),
    broker_name: text("broker_name"),
    recruit_broker_id: text("recruit_broker_id"),
    recruit_broker_name: text("recruit_broker_name"),

    // 分成比（2）
    income_percent: numeric("income_percent", { precision: 5, scale: 4 }),
    percent_map: jsonb("percent_map").$type<Record<string, string>>(), // 多场景分成比 map：键=场景代码（如 "17","1","3","4","15"），值=分成比例字符串（"0"-"100"）

    // 业务标识 + 时长汇总（16，统一拍 jsonb 不一一建列，避免列爆炸）
    misc: jsonb("misc").$type<Record<string, unknown>>(), // 业务标识 12 + 时长汇总 4 字段，详见 .tmp-design-preview/anchor-tables-fields-final.md "其他业务字段" 段

    // 项目归属（采集后 derived）
    // derive 规则：采集 anchor_profile 时 — recruit_broker_name === '三国项目' 即标记为 true
    is_threekingdoms: boolean("is_threekingdoms").notNull().default(false),

    // 系统
    raw: jsonb("raw").notNull().$type<Record<string, unknown>>(),
    synced_at: timestamp("synced_at").notNull().defaultNow(),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    idx_broker: index("idx_anchor_profile_broker").on(t.broker_id),
    idx_recruit_broker: index("idx_anchor_profile_recruit_broker").on(t.recruit_broker_id),
    idx_is_three: index("idx_anchor_profile_is_three").on(t.is_threekingdoms),
    idx_health: index("idx_anchor_profile_health").on(t.anchor_health_score),
  }),
);

/**
 * 主播按日数据（事实表）。
 * 来源：data_center/anchor_list（91 字段，fields 显式声明全集）
 * 主键：(anchor_id, date)
 */
export const anchor_daily = pgTable(
  "anchor_daily",
  {
    anchor_id: text("anchor_id").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD

    // 身份冗余（3，当日快照）
    nickname_snapshot: text("nickname_snapshot"),

    // 音浪/收益（10，单位：分）
    total_fan_ticket: bigint("total_fan_ticket", { mode: "number" }),
    live_fan_ticket_no_guest: bigint("live_fan_ticket_no_guest", { mode: "number" }),
    property_fan_ticket_no_guest: bigint("property_fan_ticket_no_guest", { mode: "number" }),
    guest_fan_ticket: bigint("guest_fan_ticket", { mode: "number" }),
    activity_fan_ticket_no_guest: bigint("activity_fan_ticket_no_guest", { mode: "number" }),
    special_fan_ticket: bigint("special_fan_ticket", { mode: "number" }),
    subscribe_fan_ticket: bigint("subscribe_fan_ticket", { mode: "number" }),
    pk_fan_ticket: bigint("pk_fan_ticket", { mode: "number" }),
    link_screen_fan_ticket: bigint("link_screen_fan_ticket", { mode: "number" }),
    link_screen_room_fan_ticket: bigint("link_screen_room_fan_ticket", { mode: "number" }),

    // 时长（3，单位：小时 numeric 6,2）
    live_duration_1d: numeric("live_duration_1d", { precision: 6, scale: 2 }),
    valid_live_duration_1d: numeric("valid_live_duration_1d", { precision: 6, scale: 2 }),
    feed_watch_duration_1d: numeric("feed_watch_duration_1d", { precision: 6, scale: 2 }),

    // 天数标记（1）
    is_solo_valid_day: integer("is_solo_valid_day"),

    // 看播/人气（2）
    feed_acu: integer("feed_acu"),
    peak_per_minute_ucnt: integer("peak_per_minute_ucnt"),

    // 粉丝/转化（2）
    total_fans: integer("total_fans"),
    new_follow_fans_1d: integer("new_follow_fans_1d"),

    // 视频统计（3）
    video_view_count: integer("video_view_count"),
    video_like_count: integer("video_like_count"),
    video_comment_count: integer("video_comment_count"),

    // 分成比（4，0-1 小数）
    current_percent: numeric("current_percent", { precision: 5, scale: 4 }),
    game_share_percent: numeric("game_share_percent", { precision: 5, scale: 4 }),
    pay_money_connect_share_percent: numeric("pay_money_connect_share_percent", {
      precision: 5,
      scale: 4,
    }),
    profit_share_ratio: numeric("profit_share_ratio", { precision: 5, scale: 4 }),

    // 状态/档案（4，当日快照）
    broker_snapshot: text("broker_snapshot"),
    signing_type_snapshot: text("signing_type_snapshot"),
    last_live_time_snapshot: text("last_live_time_snapshot"), // 字符串快照如 "17小时前"
    is_new: integer("is_new"), // 主播身份编码 — 0=老主播, 1=新主播（保留 integer 不转 boolean，遵循"字段原始性"原则）

    // 其他（4）
    anchor_info: text("anchor_info"),
    star_guard_earn_score: bigint("star_guard_earn_score", { mode: "number" }),
    total_ticket_outside_link: bigint("total_ticket_outside_link", { mode: "number" }),
    stat_guard_enter_account_earn_score: bigint("stat_guard_enter_account_earn_score", {
      mode: "number",
    }),

    // 系统
    raw: jsonb("raw").notNull().$type<Record<string, unknown>>(),
    synced_at: timestamp("synced_at").notNull().defaultNow(),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.anchor_id, t.date] }),
    idx_date: index("idx_anchor_daily_date").on(t.date),
    idx_anchor: index("idx_anchor_daily_anchor").on(t.anchor_id),
  }),
);

/**
 * 推广游戏数据（斗地主主播）。
 * 来源：faction/game/game_anchor_detail_list × 3 bizMode (cps_all / cpc / poi) × 2 promote_scene
 */
export const anchor_game_promo_daily = pgTable(
  "anchor_game_promo_daily",
  {
    anchor_id: text("anchor_id").notNull(),
    date: text("date").notNull(),
    promote_scene: text("promote_scene", { enum: ["live", "video"] }).notNull(),
    biz_mode: text("biz_mode", { enum: ["cps_all", "cpc", "poi"] }).notNull(),
    game_name: text("game_name").notNull(),

    // 基础
    promote_live_cnt_1d: integer("promote_live_cnt_1d"),
    promote_live_duration_1d: numeric("promote_live_duration_1d", { precision: 6, scale: 2 }),
    acu: integer("acu"),
    pcu: integer("pcu"),

    // 看播 / 互动 / 转化漏斗 / 付费 / 分账 — 全部拍进 raw, 仅核心字段 indexed
    promote_anchor_income_1d: bigint("promote_anchor_income_1d", { mode: "number" }), // 主播分账后
    promote_faction_income_1d: bigint("promote_faction_income_1d", { mode: "number" }),
    promote_pay_amount_1d: bigint("promote_pay_amount_1d", { mode: "number" }),
    promote_pay_ucnt_1d: integer("promote_pay_ucnt_1d"),

    raw: jsonb("raw").notNull().$type<Record<string, unknown>>(),
    synced_at: timestamp("synced_at").notNull().defaultNow(),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.anchor_id, t.date, t.promote_scene, t.biz_mode, t.game_name],
    }),
    // 索引名缩写以适应 PG 63 字符限制
    idx_date: index("idx_game_promo_date").on(t.date),
    idx_anchor: index("idx_game_promo_anchor").on(t.anchor_id),
  }),
);

/**
 * 小游戏数据（三国主播）。
 * 来源：
 *   scene=live  → faction/micro_game/live_anchor_list
 *   scene=video → micro_game/video/creator_list
 */
export const anchor_minigame_daily = pgTable(
  "anchor_minigame_daily",
  {
    anchor_id: text("anchor_id").notNull(),
    date: text("date").notNull(),
    scene: text("scene", { enum: ["live", "video"] }).notNull(),

    // 共性（命名风格用 live 那套，video 字段在 adapter 里映射进来）
    live_room_cnt: integer("live_room_cnt"),
    live_duration: numeric("live_duration", { precision: 6, scale: 2 }),
    watch_ucnt: integer("watch_ucnt"),
    gm_click_ucnt: integer("gm_click_ucnt"),
    gm_active_ucnt: integer("gm_active_ucnt"),
    gm_pay_ucnt: integer("gm_pay_ucnt"),

    // 分账（核心）
    before_divided_income: bigint("before_divided_income", { mode: "number" }),
    after_divided_author_income: bigint("after_divided_author_income", { mode: "number" }), // 主播分账后
    after_divided_trade_union_income: bigint("after_divided_trade_union_income", {
      mode: "number",
    }),
    cps_bind_uv: integer("cps_bind_uv"),

    raw: jsonb("raw").notNull().$type<Record<string, unknown>>(),
    synced_at: timestamp("synced_at").notNull().defaultNow(),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.anchor_id, t.date, t.scene] }),
    idx_date: index("idx_minigame_date").on(t.date),
    idx_anchor: index("idx_minigame_anchor").on(t.anchor_id),
  }),
);

/**
 * 主播 portrait 直播数据（曝光/进房/打赏/转化 9 字段）。
 * 来源：portrait/core_day_stats/{cid}（per-anchor 同步 API + cid）
 * 字段对齐 PRO3 ANCHOR_STATS。
 */
export const anchor_portrait_daily = pgTable(
  "anchor_portrait_daily",
  {
    anchor_id: text("anchor_id").notNull(),
    date: text("date").notNull(),

    show_uv: integer("show_uv"), // 曝光人数
    show_cnt: integer("show_cnt"), // 曝光次数
    watch_uv: integer("watch_uv"), // 进房人数
    watch_cnt: integer("watch_cnt"), // 进房次数
    enter_room_rate: numeric("enter_room_rate", { precision: 7, scale: 6 }), // 进房率
    avg_watch_duration: numeric("avg_watch_duration", { precision: 10, scale: 2 }), // 人均观看时长(秒)
    consume_uv: integer("consume_uv"), // 打赏人数
    consume_cnt: integer("consume_cnt"), // 打赏次数
    consume_rate: numeric("consume_rate", { precision: 7, scale: 6 }), // 付费转化率

    raw: jsonb("raw").notNull().$type<Record<string, unknown>>(),
    synced_at: timestamp("synced_at").notNull().defaultNow(),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.anchor_id, t.date] }),
    idx_date: index("idx_portrait_date").on(t.date),
  }),
);

/**
 * 单场小游戏激活漏斗。
 * 来源：tinker_proxy/lego/native/webcast_api/room/minigame/audience_convert
 *      + room/replay/overview_v3 (取 acu / show_uv 等)
 */
export const session_minigame_convert = pgTable(
  "session_minigame_convert",
  {
    room_id: text("room_id").primaryKey(),
    anchor_id: text("anchor_id").notNull(),
    date: text("date").notNull(), // 场次开始日

    // overview_v3 摘要
    acu: integer("acu"),
    show_uv: integer("show_uv"),

    // 激活漏斗
    not_open_game_uv: integer("not_open_game_uv"),
    not_open_game_show_uv: integer("not_open_game_show_uv"),
    not_open_game_click_uv: integer("not_open_game_click_uv"),
    not_open_game_pay_uv: integer("not_open_game_pay_uv"),
    not_open_show_per: numeric("not_open_show_per", { precision: 5, scale: 4 }),
    not_open_click_per: numeric("not_open_click_per", { precision: 5, scale: 4 }),
    not_open_pay_per: numeric("not_open_pay_per", { precision: 5, scale: 4 }),
    open_game_uv: integer("open_game_uv"),
    open_game_click_uv: integer("open_game_click_uv"),
    open_game_pay_uv: integer("open_game_pay_uv"),
    open_game_click_per: numeric("open_game_click_per", { precision: 5, scale: 4 }),
    open_game_pay_per: numeric("open_game_pay_per", { precision: 5, scale: 4 }),

    raw: jsonb("raw").notNull().$type<Record<string, unknown>>(),
    synced_at: timestamp("synced_at").notNull().defaultNow(),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    idx_anchor_date: index("idx_session_mg_anchor_date").on(t.anchor_id, t.date),
    idx_date: index("idx_session_mg_date").on(t.date),
  }),
);
