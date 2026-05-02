import type { AnchorListRow } from "@/modules/anchors";

export type ColFmt = "text" | "number" | "duration" | "percent" | "timestamp";

export interface ColumnDef {
  key: keyof AnchorListRow | "project";
  label: string;
  group: string;
  align: "left" | "right";
  fmt: ColFmt;
  sticky?: boolean;
  bold?: boolean;
}

/** 全量列定义（110+ 列，按 9 大分组） */
export const ALL_COLUMNS: ColumnDef[] = [
  // ── 1. 基础信息 ──────────────────────────────────────────────────────────
  { key: "nick_name", label: "昵称", group: "基础", align: "left", fmt: "text", sticky: true },
  { key: "project", label: "项目", group: "基础", align: "left", fmt: "text" },
  { key: "anchor_health_score", label: "健康分", group: "基础", align: "right", fmt: "number" },
  {
    key: "anchor_health_score_level",
    label: "健康分等级",
    group: "基础",
    align: "right",
    fmt: "number",
  },
  { key: "anchor_ban_30d", label: "30天封禁", group: "基础", align: "right", fmt: "number" },
  { key: "anchor_violation_30d", label: "30天违规", group: "基础", align: "right", fmt: "number" },
  { key: "live_status", label: "直播状态", group: "基础", align: "right", fmt: "number" },
  { key: "last_live_time", label: "最近开播", group: "基础", align: "right", fmt: "timestamp" },
  { key: "aweme_display_id", label: "抖音号", group: "基础", align: "left", fmt: "text" },
  { key: "aweme_short_id", label: "抖音号(原)", group: "基础", align: "left", fmt: "text" },
  {
    key: "hotsoon_display_id",
    label: "火山号",
    group: "基础",
    align: "left",
    fmt: "text",
  },
  { key: "xigua_display_id", label: "西瓜号", group: "基础", align: "left", fmt: "text" },
  { key: "real_name", label: "实名", group: "基础", align: "left", fmt: "text" },
  { key: "gender", label: "性别", group: "基础", align: "right", fmt: "number" },
  { key: "notes", label: "备注", group: "基础", align: "left", fmt: "text" },

  // ── 2. 签约 & 经纪人 ──────────────────────────────────────────────────────
  { key: "broker_name", label: "运营经纪人", group: "签约", align: "left", fmt: "text" },
  {
    key: "recruit_broker_name",
    label: "招募经纪人",
    group: "签约",
    align: "left",
    fmt: "text",
  },
  { key: "anchor_sign_type", label: "签约类型", group: "签约", align: "right", fmt: "number" },
  { key: "anchor_sign_out", label: "签约状态", group: "签约", align: "right", fmt: "number" },
  {
    key: "signing_time",
    label: "签约时间",
    group: "签约",
    align: "right",
    fmt: "timestamp",
  },
  {
    key: "sign_start_time",
    label: "签约起",
    group: "签约",
    align: "right",
    fmt: "timestamp",
  },
  {
    key: "sign_end_time",
    label: "签约止",
    group: "签约",
    align: "right",
    fmt: "timestamp",
  },
  {
    key: "union_member_end_date",
    label: "合作到期",
    group: "签约",
    align: "right",
    fmt: "timestamp",
  },
  {
    key: "join_time",
    label: "入会时间",
    group: "签约",
    align: "right",
    fmt: "timestamp",
  },
  {
    key: "first_live_time_in_faction",
    label: "首播时间",
    group: "签约",
    align: "right",
    fmt: "timestamp",
  },
  { key: "leave_time", label: "离会时间", group: "签约", align: "right", fmt: "timestamp" },
  { key: "income_percent", label: "主分成比", group: "签约", align: "right", fmt: "percent" },

  // ── 3. 音浪明细 ───────────────────────────────────────────────────────────
  {
    key: "total_fan_ticket",
    label: "总音浪",
    group: "音浪",
    align: "right",
    fmt: "number",
    bold: true,
  },
  {
    key: "live_fan_ticket_no_guest",
    label: "礼物音浪",
    group: "音浪",
    align: "right",
    fmt: "number",
  },
  {
    key: "property_fan_ticket_no_guest",
    label: "道具音浪",
    group: "音浪",
    align: "right",
    fmt: "number",
  },
  { key: "guest_fan_ticket", label: "嘉宾音浪", group: "音浪", align: "right", fmt: "number" },
  {
    key: "activity_fan_ticket_no_guest",
    label: "活动音浪",
    group: "音浪",
    align: "right",
    fmt: "number",
  },
  { key: "special_fan_ticket", label: "其他音浪", group: "音浪", align: "right", fmt: "number" },
  {
    key: "subscribe_fan_ticket",
    label: "会员订阅音浪",
    group: "音浪",
    align: "right",
    fmt: "number",
  },
  { key: "pk_fan_ticket", label: "PK音浪", group: "音浪", align: "right", fmt: "number" },
  {
    key: "link_screen_fan_ticket",
    label: "连屏音浪",
    group: "音浪",
    align: "right",
    fmt: "number",
  },
  {
    key: "link_screen_room_fan_ticket",
    label: "连屏房间音浪",
    group: "音浪",
    align: "right",
    fmt: "number",
  },
  {
    key: "star_guard_earn_score",
    label: "星守护音浪",
    group: "音浪",
    align: "right",
    fmt: "number",
  },
  {
    key: "stat_guard_enter_account_earn_score",
    label: "星守护入账",
    group: "音浪",
    align: "right",
    fmt: "number",
  },
  {
    key: "total_ticket_outside_link",
    label: "跨公会连线音浪",
    group: "音浪",
    align: "right",
    fmt: "number",
  },

  // ── 4. 时长 & 天数 ────────────────────────────────────────────────────────
  { key: "live_duration", label: "开播时长", group: "时长", align: "right", fmt: "duration" },
  {
    key: "valid_live_duration",
    label: "有效时长",
    group: "时长",
    align: "right",
    fmt: "duration",
  },
  {
    key: "feed_watch_duration",
    label: "feed看播时长",
    group: "时长",
    align: "right",
    fmt: "duration",
  },
  { key: "live_days", label: "开播天", group: "时长", align: "right", fmt: "number" },
  { key: "solo_valid_days", label: "个播有效天", group: "时长", align: "right", fmt: "number" },

  // ── 5. 互动 & 粉丝 ────────────────────────────────────────────────────────
  { key: "total_fans", label: "粉丝数", group: "互动", align: "right", fmt: "number" },
  { key: "new_follow_fans", label: "涨粉", group: "互动", align: "right", fmt: "number" },
  {
    key: "peak_per_minute_ucnt",
    label: "人气峰值",
    group: "互动",
    align: "right",
    fmt: "number",
  },
  { key: "feed_acu", label: "feed_acu", group: "互动", align: "right", fmt: "number" },
  { key: "current_percent", label: "主分成比快照", group: "互动", align: "right", fmt: "percent" },
  {
    key: "game_share_percent",
    label: "游戏分成比",
    group: "互动",
    align: "right",
    fmt: "percent",
  },
  {
    key: "pay_money_connect_share_percent",
    label: "付费连线分成比",
    group: "互动",
    align: "right",
    fmt: "percent",
  },
  {
    key: "profit_share_ratio",
    label: "会员收益比例",
    group: "互动",
    align: "right",
    fmt: "percent",
  },

  // ── 6. 视频统计 ───────────────────────────────────────────────────────────
  { key: "video_view_count", label: "视频播放", group: "视频", align: "right", fmt: "number" },
  { key: "video_like_count", label: "视频点赞", group: "视频", align: "right", fmt: "number" },
  { key: "video_comment_count", label: "视频评论", group: "视频", align: "right", fmt: "number" },

  // ── 7. 直播曝光转化 ───────────────────────────────────────────────────────
  { key: "show_uv", label: "曝光人数", group: "曝光转化", align: "right", fmt: "number" },
  { key: "show_cnt", label: "曝光次数", group: "曝光转化", align: "right", fmt: "number" },
  { key: "watch_uv", label: "进房人数", group: "曝光转化", align: "right", fmt: "number" },
  { key: "watch_cnt", label: "进房次数", group: "曝光转化", align: "right", fmt: "number" },
  { key: "enter_room_rate", label: "进房率", group: "曝光转化", align: "right", fmt: "percent" },
  {
    key: "avg_watch_duration",
    label: "人均观看时长(s)",
    group: "曝光转化",
    align: "right",
    fmt: "number",
  },
  { key: "consume_uv", label: "打赏人数", group: "曝光转化", align: "right", fmt: "number" },
  { key: "consume_cnt", label: "打赏次数", group: "曝光转化", align: "right", fmt: "number" },
  { key: "consume_rate", label: "付费转化率", group: "曝光转化", align: "right", fmt: "percent" },

  // ── 8. 推广游戏 ──────────────────────────────────────────────────────────
  { key: "g_live_cnt", label: "G-直播场次", group: "推广游戏", align: "right", fmt: "number" },
  {
    key: "g_live_duration",
    label: "G-直播时长",
    group: "推广游戏",
    align: "right",
    fmt: "duration",
  },
  { key: "g_watch_ucnt", label: "G-看播人数", group: "推广游戏", align: "right", fmt: "number" },
  { key: "g_acu", label: "G-ACU", group: "推广游戏", align: "right", fmt: "number" },
  { key: "g_pcu", label: "G-PCU", group: "推广游戏", align: "right", fmt: "number" },
  { key: "g_like_ucnt", label: "G-点赞人数", group: "推广游戏", align: "right", fmt: "number" },
  { key: "g_comment_ucnt", label: "G-评论人数", group: "推广游戏", align: "right", fmt: "number" },
  { key: "g_follow_ucnt", label: "G-关注人数", group: "推广游戏", align: "right", fmt: "number" },
  {
    key: "g_video_publish_cnt",
    label: "G-发布视频数",
    group: "推广游戏",
    align: "right",
    fmt: "number",
  },
  { key: "g_video_vv", label: "G-视频VV", group: "推广游戏", align: "right", fmt: "number" },
  { key: "g_video_uv", label: "G-视频UV", group: "推广游戏", align: "right", fmt: "number" },
  {
    key: "g_click_download",
    label: "G-点击下载",
    group: "推广游戏",
    align: "right",
    fmt: "number",
  },
  {
    key: "g_download_finish",
    label: "G-下载完成",
    group: "推广游戏",
    align: "right",
    fmt: "number",
  },
  {
    key: "g_install_finish",
    label: "G-安装完成",
    group: "推广游戏",
    align: "right",
    fmt: "number",
  },
  { key: "g_active_ucnt", label: "G-激活人数", group: "推广游戏", align: "right", fmt: "number" },
  { key: "g_pay_ucnt", label: "G-付费人数", group: "推广游戏", align: "right", fmt: "number" },
  { key: "g_pay_amount", label: "G-付费金额", group: "推广游戏", align: "right", fmt: "number" },
  {
    key: "g_props_pay_amount",
    label: "G-道具流水",
    group: "推广游戏",
    align: "right",
    fmt: "number",
  },
  {
    key: "g_props_anchor_amount",
    label: "G-主播道具分成",
    group: "推广游戏",
    align: "right",
    fmt: "number",
  },
  {
    key: "g_props_faction_amount",
    label: "G-机构道具分成",
    group: "推广游戏",
    align: "right",
    fmt: "number",
  },
  {
    key: "g_anchor_income",
    label: "G-主播分账",
    group: "推广游戏",
    align: "right",
    fmt: "number",
    bold: true,
  },
  {
    key: "g_faction_income",
    label: "G-机构分账",
    group: "推广游戏",
    align: "right",
    fmt: "number",
  },
  {
    key: "g_download_pay_ucnt",
    label: "G-下载激励付费人数",
    group: "推广游戏",
    align: "right",
    fmt: "number",
  },
  {
    key: "g_download_pay_amount",
    label: "G-下载激励金额",
    group: "推广游戏",
    align: "right",
    fmt: "number",
  },
  {
    key: "g_anchor_download_pay",
    label: "G-下载激励主播",
    group: "推广游戏",
    align: "right",
    fmt: "number",
  },
  {
    key: "g_faction_download_pay",
    label: "G-下载激励机构",
    group: "推广游戏",
    align: "right",
    fmt: "number",
  },
  {
    key: "g_active_pay_ucnt",
    label: "G-活跃激励付费人数",
    group: "推广游戏",
    align: "right",
    fmt: "number",
  },
  {
    key: "g_anchor_active_pay",
    label: "G-活跃激励主播",
    group: "推广游戏",
    align: "right",
    fmt: "number",
  },
  {
    key: "g_faction_active_pay",
    label: "G-活跃激励机构",
    group: "推广游戏",
    align: "right",
    fmt: "number",
  },

  // ── 9. 小游戏 ────────────────────────────────────────────────────────────
  { key: "mg_room_cnt", label: "MG-开播场次", group: "小游戏", align: "right", fmt: "number" },
  { key: "mg_duration", label: "MG-开播时长", group: "小游戏", align: "right", fmt: "duration" },
  { key: "mg_watch_ucnt", label: "MG-看播人数", group: "小游戏", align: "right", fmt: "number" },
  {
    key: "mg_watch_duration",
    label: "MG-看播时长",
    group: "小游戏",
    align: "right",
    fmt: "duration",
  },
  { key: "mg_acu", label: "MG-ACU", group: "小游戏", align: "right", fmt: "number" },
  { key: "mg_pcu", label: "MG-PCU", group: "小游戏", align: "right", fmt: "number" },
  { key: "mg_like_ucnt", label: "MG-点赞人数", group: "小游戏", align: "right", fmt: "number" },
  { key: "mg_follow_ucnt", label: "MG-关注人数", group: "小游戏", align: "right", fmt: "number" },
  {
    key: "mg_comment_ucnt",
    label: "MG-评论人数",
    group: "小游戏",
    align: "right",
    fmt: "number",
  },
  { key: "mg_click_ucnt", label: "MG-点击人数", group: "小游戏", align: "right", fmt: "number" },
  {
    key: "mg_active_ucnt",
    label: "MG-激活人数",
    group: "小游戏",
    align: "right",
    fmt: "number",
  },
  { key: "mg_pay_ucnt", label: "MG-付费人数", group: "小游戏", align: "right", fmt: "number" },
  {
    key: "mg_before_income",
    label: "MG-分成前流水",
    group: "小游戏",
    align: "right",
    fmt: "number",
  },
  {
    key: "mg_anchor_income",
    label: "MG-主播分成",
    group: "小游戏",
    align: "right",
    fmt: "number",
    bold: true,
  },
  {
    key: "mg_union_income",
    label: "MG-公会分成",
    group: "小游戏",
    align: "right",
    fmt: "number",
  },
  { key: "mg_cps_bind", label: "MG-CPS绑定", group: "小游戏", align: "right", fmt: "number" },
  { key: "mg_play_cnt", label: "MG-视频播放数", group: "小游戏", align: "right", fmt: "number" },
  { key: "mg_play_uv", label: "MG-视频播放人数", group: "小游戏", align: "right", fmt: "number" },
  {
    key: "mg_finish_play_uv",
    label: "MG-完播人数",
    group: "小游戏",
    align: "right",
    fmt: "number",
  },
  {
    key: "mg_finish_play_ratio",
    label: "MG-完播率",
    group: "小游戏",
    align: "right",
    fmt: "percent",
  },
];

/** 列 key 集合，用于预设 */
type ColKey = (typeof ALL_COLUMNS)[number]["key"];

// ── 预设字段集 ────────────────────────────────────────────────────────────────

/** 基础常驻列（所有预设都包含） */
const BASE_KEYS: ColKey[] = [
  "nick_name",
  "project",
  "broker_name",
  "recruit_broker_name",
  "anchor_health_score",
  "total_fans",
];

const AUDIO_KEYS: ColKey[] = [
  "total_fan_ticket",
  "live_fan_ticket_no_guest",
  "property_fan_ticket_no_guest",
  "guest_fan_ticket",
  "activity_fan_ticket_no_guest",
  "special_fan_ticket",
  "subscribe_fan_ticket",
  "star_guard_earn_score",
];

const DURATION_KEYS: ColKey[] = [
  "live_duration",
  "valid_live_duration",
  "live_days",
  "solo_valid_days",
  "new_follow_fans",
];

const PORTRAIT_KEYS: ColKey[] = [
  "show_uv",
  "watch_uv",
  "enter_room_rate",
  "consume_uv",
  "consume_rate",
];

const GAME_PROMO_KEYS: ColKey[] = [
  "g_live_cnt",
  "g_live_duration",
  "g_watch_ucnt",
  "g_acu",
  "g_click_download",
  "g_download_finish",
  "g_active_ucnt",
  "g_pay_ucnt",
  "g_pay_amount",
  "g_props_pay_amount",
  "g_anchor_income",
  "g_faction_income",
  "g_anchor_download_pay",
  "g_anchor_active_pay",
];

const MINIGAME_KEYS: ColKey[] = [
  "mg_room_cnt",
  "mg_duration",
  "mg_watch_ucnt",
  "mg_acu",
  "mg_click_ucnt",
  "mg_active_ucnt",
  "mg_pay_ucnt",
  "mg_before_income",
  "mg_anchor_income",
  "mg_union_income",
  "mg_cps_bind",
];

const SIGN_KEYS: ColKey[] = [
  "broker_name",
  "recruit_broker_name",
  "anchor_sign_type",
  "anchor_sign_out",
  "sign_start_time",
  "sign_end_time",
  "income_percent",
  "anchor_ban_30d",
  "anchor_violation_30d",
];

export type PresetId = "ddz" | "three" | "guild" | "all" | "custom";

export interface Preset {
  id: PresetId;
  label: string;
  keys: ColKey[];
}

export const PRESETS: Preset[] = [
  {
    id: "ddz",
    label: "斗地主默认",
    keys: [...BASE_KEYS, ...AUDIO_KEYS, ...DURATION_KEYS, ...PORTRAIT_KEYS, ...GAME_PROMO_KEYS],
  },
  {
    id: "three",
    label: "三国默认",
    keys: [...BASE_KEYS, ...AUDIO_KEYS, ...DURATION_KEYS, ...PORTRAIT_KEYS, ...MINIGAME_KEYS],
  },
  {
    id: "guild",
    label: "公会管理",
    keys: [...BASE_KEYS, ...SIGN_KEYS, ...AUDIO_KEYS, "g_anchor_income", "mg_anchor_income"],
  },
  {
    id: "all",
    label: "全部",
    keys: ALL_COLUMNS.map((c) => c.key),
  },
  {
    id: "custom",
    label: "自定义",
    keys: [...BASE_KEYS, ...AUDIO_KEYS, ...DURATION_KEYS],
  },
];

/** 从 localStorage 读取保存的列配置，SSR 安全（返回 null） */
export function loadSavedColumns(presetId: PresetId): ColKey[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`anchor_columns_${presetId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    // 验证所有 key 都合法
    const validKeys = new Set(ALL_COLUMNS.map((c) => c.key));
    const filtered = (parsed as string[]).filter((k) => validKeys.has(k as ColKey));
    return filtered.length > 0 ? (filtered as ColKey[]) : null;
  } catch {
    return null;
  }
}

/** 保存列配置到 localStorage */
export function saveColumns(presetId: PresetId, keys: ColKey[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`anchor_columns_${presetId}`, JSON.stringify(keys));
  } catch {
    // ignore
  }
}

/** 按 key 列表获取列定义，保持顺序 */
export function getColumnsByKeys(keys: ColKey[]): ColumnDef[] {
  const map = new Map(ALL_COLUMNS.map((c) => [c.key, c]));
  return keys.map((k) => map.get(k)).filter(Boolean) as ColumnDef[];
}

/** 按组获取所有列（中栏展示用） */
export function getColumnsByGroup(group: string): ColumnDef[] {
  return ALL_COLUMNS.filter((c) => c.group === group);
}

/** 所有分组名称（有序） */
export const ALL_GROUPS = [
  "基础",
  "签约",
  "音浪",
  "时长",
  "互动",
  "视频",
  "曝光转化",
  "推广游戏",
  "小游戏",
] as const;
