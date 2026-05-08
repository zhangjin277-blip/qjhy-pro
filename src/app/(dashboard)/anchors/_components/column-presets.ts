import type { AnchorListRow } from "@/modules/anchors";

export type ColFmt =
  | "text"
  | "number"
  | "duration"
  | "percent"
  | "timestamp"
  | "avatar"
  | "anchor_info";

export interface ColumnDef<TKey extends string = keyof AnchorListRow | "project"> {
  key: TKey;
  label: string;
  group: string;
  /** 二级分组（中栏 customizer 显示，无则不分块） */
  subGroup?: string;
  align: "left" | "right";
  fmt: ColFmt;
  sticky?: boolean;
  bold?: boolean;
  /** 固定列，永远渲染在最前；不出现在 customizer 中栏，不参与已选/排序 */
  pinned?: boolean;
}

/**
 * 全量列定义。group 严格按 API 来源分类（与爬虫 adapters 对应）：
 *   基础 / 签约           ← anchor-list (anchor_profile)
 *   主播数据              ← anchor-daily ("主播概览列表" CSV download)
 *   直播流水分成          ← game-promo live+cps task
 *   流水分成（下载+活跃激励）← game-promo live+cps_all task
 *   短视频                ← game-promo video task
 *   小游戏                ← minigame
 *   主播详情              ← portrait/core_day_stats
 */
export const ALL_COLUMNS: ColumnDef[] = [
  // ── 1. 基础（anchor-list 身份/状态）────────────────────────────────────────
  // 合并列：头像 + 昵称 + 抖音号 + UID（cell 用 fmt=anchor_info 自定义渲染）
  // pinned: 固定在最前，不在 customizer 出现，不可拖动/取消勾选
  {
    key: "nick_name",
    label: "主播信息",
    group: "基础",
    align: "left",
    fmt: "anchor_info",
    sticky: true,
    pinned: true,
  },
  { key: "project", label: "项目", group: "基础", align: "left", fmt: "text", pinned: true },
  {
    key: "controller_total_amount",
    label: "小手柄流水",
    group: "基础",
    align: "left",
    fmt: "number",
    bold: true,
  },
  {
    key: "minigame_total_amount",
    label: "小游戏流水",
    group: "基础",
    align: "left",
    fmt: "number",
    bold: true,
  },
  { key: "anchor_health_score", label: "健康分", group: "基础", align: "left", fmt: "number" },
  { key: "last_live_time", label: "最近开播", group: "基础", align: "left", fmt: "timestamp" },
  { key: "aweme_display_id", label: "抖音号", group: "基础", align: "left", fmt: "text" },
  { key: "aweme_short_id", label: "抖音号(原)", group: "基础", align: "left", fmt: "text" },
  {
    key: "hotsoon_display_id",
    label: "火山号",
    group: "基础",
    align: "left",
    fmt: "text",
  },

  // ── 2. 签约（anchor-list 签约/经纪人）─────────────────────────────────────
  { key: "broker_name", label: "运营经纪人", group: "签约", align: "left", fmt: "text" },
  {
    key: "recruit_broker_name",
    label: "招募经纪人",
    group: "签约",
    align: "left",
    fmt: "text",
  },
  {
    key: "signing_time",
    label: "签约时间",
    group: "签约",
    align: "left",
    fmt: "timestamp",
  },
  {
    key: "sign_start_time",
    label: "签约起",
    group: "签约",
    align: "left",
    fmt: "timestamp",
  },
  {
    key: "sign_end_time",
    label: "签约止",
    group: "签约",
    align: "left",
    fmt: "timestamp",
  },
  {
    key: "union_member_end_date",
    label: "合作到期",
    group: "签约",
    align: "left",
    fmt: "timestamp",
  },
  {
    key: "join_time",
    label: "入会时间",
    group: "签约",
    align: "left",
    fmt: "timestamp",
  },
  {
    key: "first_live_time_in_faction",
    label: "首播时间",
    group: "签约",
    align: "left",
    fmt: "timestamp",
  },
  { key: "income_percent", label: "主分成比", group: "签约", align: "left", fmt: "percent" },

  // ── 3. 音浪明细 ───────────────────────────────────────────────────────────
  {
    key: "total_fan_ticket",
    label: "总音浪",
    group: "主播数据",
    subGroup: "音浪",
    align: "left",
    fmt: "number",
    bold: true,
  },
  {
    key: "live_fan_ticket_no_guest",
    label: "礼物音浪",
    group: "主播数据",
    subGroup: "音浪",
    align: "left",
    fmt: "number",
  },
  {
    key: "property_fan_ticket_no_guest",
    label: "道具音浪",
    group: "主播数据",
    subGroup: "音浪",
    align: "left",
    fmt: "number",
  },
  {
    key: "guest_fan_ticket",
    label: "嘉宾音浪",
    group: "主播数据",
    subGroup: "音浪",
    align: "left",
    fmt: "number",
  },
  {
    key: "subscribe_fan_ticket",
    label: "会员订阅音浪",
    group: "主播数据",
    subGroup: "音浪",
    align: "left",
    fmt: "number",
  },
  {
    key: "pk_fan_ticket",
    label: "PK音浪",
    group: "主播数据",
    subGroup: "音浪",
    align: "left",
    fmt: "number",
  },
  {
    key: "star_guard_earn_score",
    label: "星守护音浪",
    group: "主播数据",
    subGroup: "音浪",
    align: "left",
    fmt: "number",
  },
  {
    key: "stat_guard_enter_account_earn_score",
    label: "星守护入账音浪",
    group: "主播数据",
    subGroup: "音浪",
    align: "left",
    fmt: "number",
  },

  // ── 4. 时长 & 天数 ────────────────────────────────────────────────────────
  {
    key: "live_duration",
    label: "开播时长",
    group: "主播数据",
    subGroup: "时长",
    align: "left",
    fmt: "duration",
  },
  {
    key: "valid_live_duration",
    label: "有效时长",
    group: "主播数据",
    subGroup: "时长",
    align: "left",
    fmt: "duration",
  },
  {
    key: "feed_watch_duration",
    label: "feed看播时长",
    group: "主播数据",
    subGroup: "时长",
    align: "left",
    fmt: "duration",
  },
  {
    key: "live_days",
    label: "开播天",
    group: "主播数据",
    subGroup: "时长",
    align: "left",
    fmt: "number",
  },
  {
    key: "solo_valid_days",
    label: "个播有效天",
    group: "主播数据",
    subGroup: "时长",
    align: "left",
    fmt: "number",
  },

  // ── 5. 互动 & 粉丝 ────────────────────────────────────────────────────────
  {
    key: "total_fans",
    label: "粉丝数",
    group: "主播数据",
    subGroup: "互动",
    align: "left",
    fmt: "number",
  },
  {
    key: "new_follow_fans",
    label: "涨粉",
    group: "主播数据",
    subGroup: "互动",
    align: "left",
    fmt: "number",
  },
  {
    key: "peak_per_minute_ucnt",
    label: "人气峰值",
    group: "主播数据",
    subGroup: "互动",
    align: "left",
    fmt: "number",
  },
  {
    key: "feed_acu",
    label: "feed_acu",
    group: "主播数据",
    subGroup: "互动",
    align: "left",
    fmt: "number",
  },
  {
    key: "current_percent",
    label: "主分成比快照",
    group: "主播数据",
    subGroup: "分成比",
    align: "left",
    fmt: "percent",
  },
  {
    key: "profit_share_ratio",
    label: "会员收益比例",
    group: "主播数据",
    subGroup: "分成比",
    align: "left",
    fmt: "percent",
  },

  // ── 6. 视频统计 ───────────────────────────────────────────────────────────
  {
    key: "video_view_count",
    label: "视频播放",
    group: "主播数据",
    subGroup: "视频",
    align: "left",
    fmt: "number",
  },
  {
    key: "video_like_count",
    label: "视频点赞",
    group: "主播数据",
    subGroup: "视频",
    align: "left",
    fmt: "number",
  },
  {
    key: "video_comment_count",
    label: "视频评论",
    group: "主播数据",
    subGroup: "视频",
    align: "left",
    fmt: "number",
  },

  // ── 7. 直播曝光转化 ───────────────────────────────────────────────────────
  { key: "show_uv", label: "曝光人数", group: "主播详情", align: "left", fmt: "number" },
  { key: "show_cnt", label: "曝光次数", group: "主播详情", align: "left", fmt: "number" },
  { key: "watch_uv", label: "进房人数", group: "主播详情", align: "left", fmt: "number" },
  { key: "watch_cnt", label: "进房次数", group: "主播详情", align: "left", fmt: "number" },
  { key: "enter_room_rate", label: "进房率", group: "主播详情", align: "left", fmt: "percent" },
  {
    key: "avg_watch_duration",
    label: "人均观看时长(s)",
    group: "主播详情",
    align: "left",
    fmt: "number",
  },
  { key: "consume_uv", label: "打赏人数", group: "主播详情", align: "left", fmt: "number" },
  { key: "consume_cnt", label: "打赏次数", group: "主播详情", align: "left", fmt: "number" },
  { key: "consume_rate", label: "付费转化率", group: "主播详情", align: "left", fmt: "percent" },

  // ── 4. 直播流水分成（game-promo live + cps task）─────────────────────────
  {
    key: "g_live_cnt",
    label: "直播游戏开播场次",
    group: "直播流水分成",
    subGroup: "开播指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "g_live_duration",
    label: "直播游戏开播时长",
    group: "直播流水分成",
    subGroup: "开播指标",
    align: "left",
    fmt: "duration",
  },
  {
    key: "g_live_duration_avg",
    label: "直播场均游戏开播时长",
    group: "直播流水分成",
    subGroup: "开播指标",
    align: "left",
    fmt: "duration",
  },
  {
    key: "g_watch_ucnt",
    label: "直播游戏看播人数",
    group: "直播流水分成",
    subGroup: "流量指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "g_watch_duration",
    label: "直播游戏看播时长",
    group: "直播流水分成",
    subGroup: "流量指标",
    align: "left",
    fmt: "duration",
  },
  {
    key: "g_watch_duration_uavg",
    label: "直播人均游戏看播时长",
    group: "直播流水分成",
    subGroup: "流量指标",
    align: "left",
    fmt: "duration",
  },
  {
    key: "g_acu",
    label: "直播ACU",
    group: "直播流水分成",
    subGroup: "流量指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "g_pcu",
    label: "直播PCU",
    group: "直播流水分成",
    subGroup: "流量指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "g_like_ucnt",
    label: "直播点赞人数",
    group: "直播流水分成",
    subGroup: "互动指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "g_follow_ucnt",
    label: "直播关注人数",
    group: "直播流水分成",
    subGroup: "互动指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "g_comment_ucnt",
    label: "直播评论人数",
    group: "直播流水分成",
    subGroup: "互动指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "g_like_uavg",
    label: "直播点赞率",
    group: "直播流水分成",
    subGroup: "互动指标",
    align: "left",
    fmt: "percent",
  },
  {
    key: "g_follow_uavg",
    label: "直播关注率",
    group: "直播流水分成",
    subGroup: "互动指标",
    align: "left",
    fmt: "percent",
  },
  {
    key: "g_comment_uavg",
    label: "直播评论率",
    group: "直播流水分成",
    subGroup: "互动指标",
    align: "left",
    fmt: "percent",
  },
  {
    key: "g_click_download",
    label: "直播游戏下载点击人数",
    group: "直播流水分成",
    subGroup: "转化指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "g_start_download",
    label: "直播安卓游戏下载开始人数",
    group: "直播流水分成",
    subGroup: "转化指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "g_download_finish",
    label: "直播安卓游戏下载完成人数",
    group: "直播流水分成",
    subGroup: "转化指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "g_install_finish",
    label: "直播安装",
    group: "直播流水分成",
    subGroup: "转化指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "g_active_ucnt",
    label: "直播游戏活跃用户数",
    group: "直播流水分成",
    subGroup: "收益指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "g_pay_ucnt",
    label: "直播游戏内购付费用户数",
    group: "直播流水分成",
    subGroup: "收益指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "g_pay_amount",
    label: "直播-游戏流水(分成前)",
    group: "直播流水分成",
    subGroup: "收益指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "g_props_pay_amount",
    label: "直播道具推广流水(分成前)",
    group: "直播流水分成",
    subGroup: "收益指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "g_props_anchor_amount",
    label: "直播主播道具推广收入(分成后)",
    group: "直播流水分成",
    subGroup: "收益指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "g_props_faction_amount",
    label: "直播机构道具推广收入(分成后)",
    group: "直播流水分成",
    subGroup: "收益指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "g_anchor_income",
    label: "直播-主播游戏收入(分成后)",
    group: "直播流水分成",
    subGroup: "收益指标",
    align: "left",
    fmt: "number",
    bold: true,
  },
  {
    key: "g_faction_income",
    label: "直播-机构游戏收入(分成后)",
    group: "直播流水分成",
    subGroup: "收益指标",
    align: "left",
    fmt: "number",
  },

  // ── 5. 流水分成（下载+活跃激励）（game-promo live + cps_all task）────────
  {
    key: "g_download_pay_ucnt",
    label: "直播下载充值玩家",
    group: "直播流水分成（下载+活跃激励）",
    align: "left",
    fmt: "number",
  },
  {
    key: "g_download_pay_amount",
    label: "直播下载充值流水",
    group: "直播流水分成（下载+活跃激励）",
    align: "left",
    fmt: "number",
  },
  {
    key: "g_anchor_download_pay",
    label: "直播主播促进玩家下载分成收入",
    group: "直播流水分成（下载+活跃激励）",
    align: "left",
    fmt: "number",
  },
  {
    key: "g_faction_download_pay",
    label: "直播机构促进玩家下载分成收入",
    group: "直播流水分成（下载+活跃激励）",
    align: "left",
    fmt: "number",
  },
  {
    key: "g_active_pay_ucnt",
    label: "直播活跃充值玩家",
    group: "直播流水分成（下载+活跃激励）",
    align: "left",
    fmt: "number",
  },
  {
    key: "g_anchor_active_pay",
    label: "直播主播促进玩家活跃分成收入",
    group: "直播流水分成（下载+活跃激励）",
    align: "left",
    fmt: "number",
  },
  {
    key: "g_faction_active_pay",
    label: "直播机构促进玩家活跃分成收入",
    group: "直播流水分成（下载+活跃激励）",
    align: "left",
    fmt: "number",
  },
  // 计算字段
  {
    key: "g_promote_active_amount",
    label: "直播促活流水",
    group: "直播流水分成（下载+活跃激励）",
    align: "left",
    fmt: "number",
    bold: true,
  },
  {
    key: "g_total_amount",
    label: "直播当日流水",
    group: "直播流水分成（下载+活跃激励）",
    align: "left",
    fmt: "number",
    bold: true,
  },

  // ── 6. 短视频流水分成（game-promo video + cps）─────────────────────────
  // 投稿
  {
    key: "v_publish_cnt",
    label: "短视频游戏视频投稿数",
    group: "短视频流水分成",
    subGroup: "投稿指标",
    align: "left",
    fmt: "number",
  },
  // 流量
  {
    key: "v_vv",
    label: "短视频游戏视频播放数",
    group: "短视频流水分成",
    subGroup: "流量指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "v_uv",
    label: "短视频游戏视频播放人数",
    group: "短视频流水分成",
    subGroup: "流量指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "v_uavg",
    label: "短视频人均游戏视频播放数",
    group: "短视频流水分成",
    subGroup: "流量指标",
    align: "left",
    fmt: "number",
  },
  // 互动
  {
    key: "v_finish_play_ucnt",
    label: "短视频完播人数",
    group: "短视频流水分成",
    subGroup: "互动指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "v_like_ucnt",
    label: "短视频点赞人数",
    group: "短视频流水分成",
    subGroup: "互动指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "v_follow_ucnt",
    label: "短视频关注人数",
    group: "短视频流水分成",
    subGroup: "互动指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "v_comment_ucnt",
    label: "短视频评论人数",
    group: "短视频流水分成",
    subGroup: "互动指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "v_finish_play_ratio",
    label: "短视频完播率",
    group: "短视频流水分成",
    subGroup: "互动指标",
    align: "left",
    fmt: "percent",
  },
  {
    key: "v_like_uavg",
    label: "短视频点赞率",
    group: "短视频流水分成",
    subGroup: "互动指标",
    align: "left",
    fmt: "percent",
  },
  {
    key: "v_follow_uavg",
    label: "短视频关注率",
    group: "短视频流水分成",
    subGroup: "互动指标",
    align: "left",
    fmt: "percent",
  },
  {
    key: "v_comment_uavg",
    label: "短视频评论率",
    group: "短视频流水分成",
    subGroup: "互动指标",
    align: "left",
    fmt: "percent",
  },
  // 转化
  {
    key: "v_click_download",
    label: "短视频游戏下载点击人数",
    group: "短视频流水分成",
    subGroup: "转化指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "v_start_download",
    label: "短视频安卓游戏下载开始人数",
    group: "短视频流水分成",
    subGroup: "转化指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "v_download_finish",
    label: "短视频安卓游戏下载完成人数",
    group: "短视频流水分成",
    subGroup: "转化指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "v_install_finish",
    label: "短视频安装",
    group: "短视频流水分成",
    subGroup: "转化指标",
    align: "left",
    fmt: "number",
  },
  // 收益
  {
    key: "v_active_ucnt",
    label: "短视频游戏活跃用户数",
    group: "短视频流水分成",
    subGroup: "收益指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "v_charge_pay_ucnt",
    label: "短视频游戏内购付费用户数",
    group: "短视频流水分成",
    subGroup: "收益指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "v_pay_amount",
    label: "短视频-游戏流水(分成前)",
    group: "短视频流水分成",
    subGroup: "收益指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "v_anchor_income",
    label: "短视频-创作者游戏收入(分成后)",
    group: "短视频流水分成",
    subGroup: "收益指标",
    align: "left",
    fmt: "number",
    bold: true,
  },
  {
    key: "v_faction_income",
    label: "短视频-机构游戏收入(分成后)",
    group: "短视频流水分成",
    subGroup: "收益指标",
    align: "left",
    fmt: "number",
  },

  // ── 6b. 短视频促活分成（game-promo video + cps_all）─────────────────────
  {
    key: "v_download_pay_ucnt",
    label: "短视频下载充值玩家",
    group: "短视频流水分成（下载+活跃激励）",
    subGroup: "收益指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "v_download_pay_amount",
    label: "短视频下载充值流水",
    group: "短视频流水分成（下载+活跃激励）",
    subGroup: "收益指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "v_anchor_download_pay",
    label: "短视频创作者促进玩家下载分成收入",
    group: "短视频流水分成（下载+活跃激励）",
    subGroup: "收益指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "v_faction_download_pay",
    label: "短视频机构促进玩家下载分成收入",
    group: "短视频流水分成（下载+活跃激励）",
    subGroup: "收益指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "v_active_pay_ucnt",
    label: "短视频活跃充值玩家",
    group: "短视频流水分成（下载+活跃激励）",
    subGroup: "收益指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "v_anchor_active_pay",
    label: "短视频创作者促进玩家活跃分成收入",
    group: "短视频流水分成（下载+活跃激励）",
    subGroup: "收益指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "v_faction_active_pay",
    label: "短视频机构促进玩家活跃分成收入",
    group: "短视频流水分成（下载+活跃激励）",
    subGroup: "收益指标",
    align: "left",
    fmt: "number",
  },
  // 计算字段
  {
    key: "v_promote_active_amount",
    label: "短视频促活流水",
    group: "短视频流水分成（下载+活跃激励）",
    subGroup: "收益指标",
    align: "left",
    fmt: "number",
    bold: true,
  },
  {
    key: "v_total_amount",
    label: "短视频当日流水",
    group: "短视频流水分成（下载+活跃激励）",
    subGroup: "收益指标",
    align: "left",
    fmt: "number",
    bold: true,
  },

  // ── 7. 小游戏（minigame）─────────────────────────────────────────────────
  {
    key: "mg_room_cnt",
    label: "小游戏开播场次",
    group: "小游戏",
    subGroup: "开播指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "mg_duration",
    label: "小游戏开播时长",
    group: "小游戏",
    subGroup: "开播指标",
    align: "left",
    fmt: "duration",
  },
  {
    key: "mg_avg_room_live_duration",
    label: "场均小游戏开播时长",
    group: "小游戏",
    subGroup: "开播指标",
    align: "left",
    fmt: "duration",
  },
  {
    key: "mg_watch_ucnt",
    label: "小游戏看播人数",
    group: "小游戏",
    subGroup: "流量指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "mg_watch_duration",
    label: "小游戏看播时长",
    group: "小游戏",
    subGroup: "流量指标",
    align: "left",
    fmt: "duration",
  },
  {
    key: "mg_avg_user_watch_duration",
    label: "人均小游戏看播时长",
    group: "小游戏",
    subGroup: "流量指标",
    align: "left",
    fmt: "duration",
  },
  {
    key: "mg_acu",
    label: "ACU",
    group: "小游戏",
    subGroup: "流量指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "mg_pcu",
    label: "PCU",
    group: "小游戏",
    subGroup: "流量指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "mg_like_ucnt",
    label: "点赞人数",
    group: "小游戏",
    subGroup: "互动指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "mg_follow_ucnt",
    label: "关注人数",
    group: "小游戏",
    subGroup: "互动指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "mg_comment_ucnt",
    label: "评论人数",
    group: "小游戏",
    subGroup: "互动指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "mg_like_ratio",
    label: "点赞率",
    group: "小游戏",
    subGroup: "互动指标",
    align: "left",
    fmt: "percent",
  },
  {
    key: "mg_follow_ratio",
    label: "关注率",
    group: "小游戏",
    subGroup: "互动指标",
    align: "left",
    fmt: "percent",
  },
  {
    key: "mg_comment_ratio",
    label: "评论率",
    group: "小游戏",
    subGroup: "互动指标",
    align: "left",
    fmt: "percent",
  },
  {
    key: "mg_click_ucnt",
    label: "小游戏点击人数",
    group: "小游戏",
    subGroup: "转化指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "mg_active_ucnt",
    label: "小游戏活跃用户数",
    group: "小游戏",
    subGroup: "转化指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "mg_pay_ucnt",
    label: "小游戏付费用户数",
    group: "小游戏",
    subGroup: "转化指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "mg_before_income",
    label: "直播-小游戏流水(分成前)",
    group: "小游戏",
    subGroup: "收益指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "mg_anchor_income",
    label: "直播-小游戏收入主播分成(分成后)",
    group: "小游戏",
    subGroup: "收益指标",
    align: "left",
    fmt: "number",
    bold: true,
  },
  {
    key: "mg_union_income",
    label: "直播-小游戏收入公会分成(分成后)",
    group: "小游戏",
    subGroup: "收益指标",
    align: "left",
    fmt: "number",
  },
  {
    key: "mg_cps_bind",
    label: "小游戏cps绑定用户数",
    group: "小游戏",
    subGroup: "收益指标",
    align: "left",
    fmt: "number",
  },
];

/** 列 key 集合，用于预设 */
type ColKey = (typeof ALL_COLUMNS)[number]["key"];

// ── 预设字段集 ────────────────────────────────────────────────────────────────

/** 基础常驻列（所有预设都包含；nick_name / project 是 pinned 列，渲染时自动加，不放预设里） */
const BASE_KEYS: ColKey[] = [
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

const SIGN_KEYS: ColKey[] = [
  "broker_name",
  "recruit_broker_name",
  "sign_start_time",
  "sign_end_time",
  "income_percent",
];

export type PresetId = "ddz" | "three" | "guild" | "custom";

export interface Preset {
  id: PresetId;
  label: string;
  keys: ColKey[];
}

export const PRESETS: Preset[] = [
  {
    id: "ddz",
    label: "斗地主默认",
    keys: [
      "broker_name",
      "recruit_broker_name",
      "total_fan_ticket",
      "controller_total_amount",
      "show_uv",
      "g_watch_ucnt",
      "g_acu",
      "feed_acu",
      "g_pcu",
      "g_install_finish",
      "g_total_amount",
      "v_total_amount",
    ],
  },
  {
    id: "three",
    label: "三国默认",
    keys: [
      "broker_name",
      "recruit_broker_name",
      "total_fan_ticket",
      "minigame_total_amount",
      "show_uv",
      "watch_uv",
      "mg_watch_ucnt",
      "mg_click_ucnt",
      "mg_active_ucnt",
      "mg_acu",
      "feed_acu",
      "mg_pcu",
      "mg_room_cnt",
      "mg_duration",
    ],
  },
  {
    id: "guild",
    label: "公会管理",
    keys: [...BASE_KEYS, ...SIGN_KEYS, ...AUDIO_KEYS, "g_anchor_income", "mg_anchor_income"],
  },
  {
    id: "custom",
    label: "自定义",
    keys: [...BASE_KEYS, ...AUDIO_KEYS, ...DURATION_KEYS],
  },
];

// v5: 项目列也改为 pinned（自动渲染、不入预设），bump 让旧缓存失效
const STORAGE_KEY_PREFIX = "anchor_columns_v5_";

/** 固定列（pinned: true 的，永远渲染在最前；不参与 customizer） */
export const PINNED_COLUMNS: ColumnDef[] = ALL_COLUMNS.filter((c) => c.pinned);

/** 从 localStorage 读取保存的列配置，SSR 安全（返回 null） */
export function loadSavedColumns(presetId: PresetId): ColKey[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${presetId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    // 验证 key 合法 + 过滤掉 pinned 列（pinned 不入预设）
    const validKeys = new Set(ALL_COLUMNS.filter((c) => !c.pinned).map((c) => c.key));
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
    window.localStorage.setItem(`${STORAGE_KEY_PREFIX}${presetId}`, JSON.stringify(keys));
  } catch {
    // ignore
  }
}

/** 按 key 列表获取列定义，保持顺序 */
export function getColumnsByKeys(keys: ColKey[]): ColumnDef[] {
  const map = new Map(ALL_COLUMNS.map((c) => [c.key, c]));
  return keys.map((k) => map.get(k)).filter(Boolean) as ColumnDef[];
}

/** 按组获取所有列（中栏展示用，pinned 列不显示） */
export function getColumnsByGroup(group: string): ColumnDef[] {
  return ALL_COLUMNS.filter((c) => c.group === group && !c.pinned);
}

/** 按 subGroup 切块返回（保持 ALL_COLUMNS 原顺序）。无 subGroup 的列归入 null 块。 */
export function getColumnsBySubGroup(
  group: string,
): { subGroup: string | null; columns: ColumnDef[] }[] {
  const cols = getColumnsByGroup(group);
  const blocks: { subGroup: string | null; columns: ColumnDef[] }[] = [];
  for (const c of cols) {
    const sg = c.subGroup ?? null;
    const last = blocks[blocks.length - 1];
    if (last && last.subGroup === sg) {
      last.columns.push(c);
    } else {
      blocks.push({ subGroup: sg, columns: [c] });
    }
  }
  return blocks;
}

/** 所有分组名称（按 API 来源 + 用户预期顺序，game-promo 4 task 对称） */
export const ALL_GROUPS = [
  "基础",
  "签约",
  "主播数据",
  "直播流水分成",
  "直播流水分成（下载+活跃激励）",
  "短视频流水分成",
  "短视频流水分成（下载+活跃激励）",
  "小游戏",
  "主播详情",
] as const;
