import type { ColumnDef } from "./column-presets";

/**
 * 快手主播明细的列配置（独立于抖音）。
 *
 * 分组结构与抖音一致：左栏按业务平铺 group（无大类），中栏直接列出该 group 的列。
 *
 * 数据源差异通过 dataSource chip 联动 visibleKeys 切换（dataSourceColumnPresets），
 * 不在 customizer 分组上区分 today/history。
 */

export type KuaishouColKey =
  // pinned
  | "account_name"
  | "product"
  // 公会信息
  | "agent_name"
  | "live_status"
  | "fans_count"
  | "joined_at"
  | "contract_expire_at"
  // 直播表现
  | "session_count"
  | "total_amt"
  | "avg_acu"
  | "total_duration_h"
  // 流量
  | "max_peak"
  | "total_play_uv"
  | "total_play_user_cnt"
  | "avg_play_rate"
  | "avg_per_play_time_min"
  | "avg_live_cover_ctr"
  // 涨粉
  | "total_add_fans"
  | "total_follow_author"
  | "total_cancel_follow"
  | "avg_transfer_fans_rate"
  | "max_fans_club_cnt"
  // 互动（公会后台只有"次数"和"播放比"，无"人数"和"互动总量"，API 单场粒度也不返回 _uv/interact）
  | "total_like_cnt"
  | "avg_like_rate"
  | "total_comment_cnt"
  | "avg_comment_rate"
  | "total_share_cnt"
  | "avg_share_rate"
  // 送礼（API 不返回 sent_gift_cnt / live_video_amt / live_chat_room_amt，已移除）
  | "total_send_gift_uv"
  // 违规
  | "total_report_num"
  | "avg_report_rate"
  // 画像与状态
  | "fans_most_age"
  | "fans_male_rate"
  | "fans_most_province"
  | "author_type"
  | "author_ratio"
  | "has_promote"
  | "has_punish"
  | "settle_in_time"
  | "settle_province";

export const KS_GROUPS = [
  "公会信息",
  "直播表现",
  "流量",
  "涨粉",
  "互动",
  "送礼",
  "违规",
  "画像与状态",
];

export const KS_COLUMNS: ColumnDef<KuaishouColKey>[] = [
  // pinned
  {
    key: "account_name",
    label: "主播",
    group: "公会信息",
    align: "left",
    fmt: "anchor_info",
    sticky: true,
    pinned: true,
  },
  { key: "product", label: "项目", group: "公会信息", align: "left", fmt: "text", pinned: true },

  // 公会信息
  { key: "agent_name", label: "经纪人", group: "公会信息", align: "left", fmt: "text" },
  { key: "live_status", label: "状态", group: "公会信息", align: "left", fmt: "text" },
  { key: "fans_count", label: "粉丝数", group: "公会信息", align: "left", fmt: "number" },
  { key: "joined_at", label: "入驻时间", group: "公会信息", align: "left", fmt: "timestamp" },
  {
    key: "contract_expire_at",
    label: "合约到期",
    group: "公会信息",
    align: "left",
    fmt: "timestamp",
  },

  // 直播表现
  { key: "session_count", label: "场次", group: "直播表现", align: "left", fmt: "number" },
  { key: "total_amt", label: "流水", group: "直播表现", align: "left", fmt: "number" },
  { key: "avg_acu", label: "平均ACU", group: "直播表现", align: "left", fmt: "number" },
  {
    key: "total_duration_h",
    label: "总直播时长",
    group: "直播表现",
    align: "left",
    fmt: "duration",
  },

  // 流量
  { key: "max_peak", label: "峰值在线", group: "流量", align: "left", fmt: "number" },
  { key: "total_play_uv", label: "有效观看人数", group: "流量", align: "left", fmt: "number" },
  { key: "total_play_user_cnt", label: "总观看次数", group: "流量", align: "left", fmt: "number" },
  { key: "avg_play_rate", label: "平均观看率", group: "流量", align: "left", fmt: "percent" },
  {
    key: "avg_per_play_time_min",
    label: "平均观看时长",
    group: "流量",
    align: "left",
    fmt: "duration",
  },
  { key: "avg_live_cover_ctr", label: "封面点击率", group: "流量", align: "left", fmt: "percent" },

  // 涨粉
  { key: "total_add_fans", label: "净涨粉", group: "涨粉", align: "left", fmt: "number" },
  { key: "total_follow_author", label: "直播关注", group: "涨粉", align: "left", fmt: "number" },
  { key: "total_cancel_follow", label: "直播取关", group: "涨粉", align: "left", fmt: "number" },
  {
    key: "avg_transfer_fans_rate",
    label: "平均转粉率",
    group: "涨粉",
    align: "left",
    fmt: "percent",
  },
  { key: "max_fans_club_cnt", label: "粉丝团总数", group: "涨粉", align: "left", fmt: "number" },

  // 互动（公会后台只有"次数"和"播放比"，无"人数"和"互动总量"）
  { key: "total_like_cnt", label: "点赞次数", group: "互动", align: "left", fmt: "number" },
  { key: "avg_like_rate", label: "点赞播放比", group: "互动", align: "left", fmt: "percent" },
  { key: "total_comment_cnt", label: "评论次数", group: "互动", align: "left", fmt: "number" },
  { key: "avg_comment_rate", label: "评论播放比", group: "互动", align: "left", fmt: "percent" },
  { key: "total_share_cnt", label: "分享次数", group: "互动", align: "left", fmt: "number" },
  { key: "avg_share_rate", label: "分享播放比", group: "互动", align: "left", fmt: "percent" },

  // 送礼（API 不返回 sent_gift_cnt / live_video_amt / live_chat_room_amt）
  { key: "total_send_gift_uv", label: "送礼人数", group: "送礼", align: "left", fmt: "number" },

  // 违规
  { key: "total_report_num", label: "举报次数", group: "违规", align: "left", fmt: "number" },
  { key: "avg_report_rate", label: "举报率", group: "违规", align: "left", fmt: "percent" },

  // 画像与状态（today_extra；取最新一场）
  {
    key: "fans_most_age",
    label: "主要粉丝年龄",
    group: "画像与状态",
    align: "left",
    fmt: "text",
  },
  {
    key: "fans_male_rate",
    label: "男性粉丝率",
    group: "画像与状态",
    align: "left",
    fmt: "percent",
  },
  {
    key: "fans_most_province",
    label: "主要粉丝省份",
    group: "画像与状态",
    align: "left",
    fmt: "text",
  },
  { key: "author_type", label: "主播分级", group: "画像与状态", align: "left", fmt: "text" },
  { key: "author_ratio", label: "分成比例", group: "画像与状态", align: "left", fmt: "percent" },
  { key: "has_promote", label: "有推广", group: "画像与状态", align: "left", fmt: "text" },
  { key: "has_punish", label: "有处罚", group: "画像与状态", align: "left", fmt: "text" },
  {
    key: "settle_in_time",
    label: "签约时间",
    group: "画像与状态",
    align: "left",
    fmt: "timestamp",
  },
  { key: "settle_province", label: "签约省份", group: "画像与状态", align: "left", fmt: "text" },
];

export function getKsColumnsByGroup(group: string): ColumnDef<KuaishouColKey>[] {
  return KS_COLUMNS.filter((c) => c.group === group && !c.pinned);
}

/** 按 subGroup 切块（保持 KS_COLUMNS 原顺序）。无 subGroup 的列归入 null 块。 */
export function getKsColumnsBySubGroup(
  group: string,
): { subGroup: string | null; columns: ColumnDef<KuaishouColKey>[] }[] {
  const cols = getKsColumnsByGroup(group);
  const blocks: { subGroup: string | null; columns: ColumnDef<KuaishouColKey>[] }[] = [];
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

export const KS_DEFAULT_VISIBLE: KuaishouColKey[] = [
  "agent_name",
  "live_status",
  "fans_count",
  "contract_expire_at",
  "session_count",
  "total_amt",
  "avg_acu",
];
