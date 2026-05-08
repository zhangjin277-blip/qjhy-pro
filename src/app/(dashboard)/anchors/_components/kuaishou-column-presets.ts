import type { ColumnDef } from "./column-presets";

/**
 * 快手主播明细的列配置（独立于抖音）。
 * key 全部是 string 字面量（来自 KuaishouAnchorTable 的 SortKey）。
 */

export type KuaishouColKey =
  // 基础（pinned）
  | "account_name"
  | "product"
  // 基础
  | "agent_name"
  | "live_status"
  // 公会信息
  | "fans_count"
  | "joined_at"
  | "contract_expire_at"
  // 直播表现 - 基础
  | "session_count"
  | "total_amt"
  | "avg_acu"
  | "max_peak"
  | "total_add_fans"
  | "total_duration_h"
  // 流量
  | "total_play_uv"
  | "total_play_user_cnt"
  | "avg_play_rate"
  | "avg_per_play_time_min"
  // 涨粉
  | "total_follow_author"
  | "total_cancel_follow"
  | "avg_transfer_fans_rate"
  // 互动
  | "total_like_cnt"
  | "total_comment_cnt"
  | "total_share_cnt"
  | "avg_like_rate"
  | "avg_comment_rate"
  // 送礼
  | "total_send_gift_uv"
  | "total_sent_gift_cnt"
  // 违规
  | "total_report_num";

export const KS_GROUPS = ["基础", "公会信息", "直播表现", "流量", "涨粉", "互动", "送礼", "违规"];

export const KS_COLUMNS: ColumnDef<KuaishouColKey>[] = [
  // 基础（含 pinned）
  {
    key: "account_name",
    label: "主播",
    group: "基础",
    align: "left",
    fmt: "anchor_info",
    sticky: true,
    pinned: true,
  },
  { key: "product", label: "项目", group: "基础", align: "left", fmt: "text", pinned: true },
  { key: "agent_name", label: "经纪人", group: "基础", align: "left", fmt: "text" },
  { key: "live_status", label: "状态", group: "基础", align: "left", fmt: "text" },

  // 公会信息
  { key: "fans_count", label: "粉丝数", group: "公会信息", align: "right", fmt: "number" },
  { key: "joined_at", label: "入驻时间", group: "公会信息", align: "left", fmt: "timestamp" },
  {
    key: "contract_expire_at",
    label: "合约到期",
    group: "公会信息",
    align: "left",
    fmt: "timestamp",
  },

  // 直播表现 - 基础
  { key: "session_count", label: "场次", group: "直播表现", align: "right", fmt: "number" },
  { key: "total_amt", label: "流水", group: "直播表现", align: "right", fmt: "number" },
  { key: "avg_acu", label: "平均ACU", group: "直播表现", align: "right", fmt: "number" },
  {
    key: "total_duration_h",
    label: "总直播时长",
    group: "直播表现",
    align: "right",
    fmt: "duration",
  },

  // 流量
  { key: "total_play_uv", label: "有效观看人数", group: "流量", align: "right", fmt: "number" },
  { key: "max_peak", label: "峰值在线", group: "流量", align: "right", fmt: "number" },
  { key: "total_play_user_cnt", label: "总观看次数", group: "流量", align: "right", fmt: "number" },
  { key: "avg_play_rate", label: "平均观看率", group: "流量", align: "right", fmt: "percent" },
  {
    key: "avg_per_play_time_min",
    label: "平均观看时长",
    group: "流量",
    align: "right",
    fmt: "duration",
  },

  // 涨粉
  { key: "total_add_fans", label: "净涨粉", group: "涨粉", align: "right", fmt: "number" },
  { key: "total_follow_author", label: "直播关注", group: "涨粉", align: "right", fmt: "number" },
  { key: "total_cancel_follow", label: "直播取关", group: "涨粉", align: "right", fmt: "number" },
  {
    key: "avg_transfer_fans_rate",
    label: "平均转粉率",
    group: "涨粉",
    align: "right",
    fmt: "percent",
  },

  // 互动
  { key: "total_like_cnt", label: "点赞", group: "互动", align: "right", fmt: "number" },
  { key: "avg_like_rate", label: "点赞率", group: "互动", align: "right", fmt: "percent" },
  { key: "total_comment_cnt", label: "评论", group: "互动", align: "right", fmt: "number" },
  { key: "avg_comment_rate", label: "评论率", group: "互动", align: "right", fmt: "percent" },
  { key: "total_share_cnt", label: "分享", group: "互动", align: "right", fmt: "number" },

  // 送礼
  { key: "total_send_gift_uv", label: "送礼人数", group: "送礼", align: "right", fmt: "number" },
  { key: "total_sent_gift_cnt", label: "送礼次数", group: "送礼", align: "right", fmt: "number" },

  // 违规
  { key: "total_report_num", label: "举报次数", group: "违规", align: "right", fmt: "number" },
];

export function getKsColumnsByGroup(group: string): ColumnDef<KuaishouColKey>[] {
  return KS_COLUMNS.filter((c) => c.group === group && !c.pinned);
}

export function getKsColumnsBySubGroup(
  group: string,
): { subGroup: string | null; columns: ColumnDef<KuaishouColKey>[] }[] {
  const cols = getKsColumnsByGroup(group);
  return [{ subGroup: null, columns: cols }];
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
