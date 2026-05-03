import "server-only";
import type { Page } from "puppeteer-core";
import { runExport } from "../download-helper";
import { parseDuration, parsePercent, parseChineseNumber } from "../parsers";

const ENDPOINT = "/ark/api/data/pugna_component/download/v2/union/data_center/anchor_list";

/**
 * 抖音公会平台导出"主播概览列表"。
 * 走 download 模式（同步 API 只返 19 字段，download 才能拿全指标）。
 *
 * 这 14 字段是平台前端导出按钮真实使用的 fields，平台后端会自动加上身份/经纪人/分成比等默认字段，
 * 最终 CSV 约 30+ 列。
 */
const FIELDS = [
  "totalFanTicket",
  "liveFanTicketWithoutGuest",
  "activityFanTicketWithoutGuest",
  "propertyFanTicketWithoutGuest",
  "subscribeFanTicket",
  "specialFanTicket",
  "isSingleThan1hLiveValidDay",
  "liveDuration1d",
  "single25minValidLiveDuration1d",
  "feedAcuRaw",
  "feedWatchDuration1d",
  "perMinuteUcnt1d",
  "guestFanTicket",
  "anchorInfo",
  // 补充：涨粉 + 视频统计 + 星守护
  "newFollowFansUcnt1d",
  "VideoCountRaw",
  "ViewCountRaw",
  "LikeCountRaw",
  "CommentCountRaw",
  "starGuardEarnScore",
  "statGuardEnterAccountEarnScore",
  "profitShareRatio",
];

export interface AnchorDailyRow {
  anchor_id: string;
  date: string;
  nickname_snapshot: string | null;

  total_fan_ticket: number | null;
  live_fan_ticket_no_guest: number | null;
  property_fan_ticket_no_guest: number | null;
  guest_fan_ticket: number | null;
  subscribe_fan_ticket: number | null;
  pk_fan_ticket: number | null;

  live_duration_1d: number | null;
  valid_live_duration_1d: number | null;
  is_solo_valid_day: number | null;
  feed_watch_duration_1d: number | null;

  feed_acu: number | null;
  peak_per_minute_ucnt: number | null;

  total_fans: number | null;
  new_follow_fans_1d: number | null;

  video_view_count: number | null;
  video_like_count: number | null;
  video_comment_count: number | null;

  current_percent: number | null;
  profit_share_ratio: number | null;

  broker_snapshot: string | null;
  signing_type_snapshot: string | null;
  last_live_time_snapshot: string | null;
  is_new: number | null;

  anchor_info: string | null;
  star_guard_earn_score: number | null;
  stat_guard_enter_account_earn_score: number | null;

  raw: Record<string, unknown>;
}

/**
 * 触发导出 + 轮询 + 下载 CSV + 返回中文表头行。
 * 整个过程 30s-3min。
 */
export async function fetchAnchorDaily(
  page: Page,
  date: string,
): Promise<Record<string, string>[]> {
  return runExport(page, {
    endpoint: ENDPOINT,
    filename: "主播概览列表",
    params: {
      page: 1,
      size: 10,
      fields: FIELDS,
      gray: "with_invite_broker",
      begin_date: date,
      end_date: date,
      order_field: "totalFanTicket",
      sort_type: "desc",
    },
  });
}

/**
 * 中文 CSV 行 → AnchorDailyRow。
 */
export function parseAnchorDailyResponse(
  rows: Record<string, string>[],
  date: string,
): AnchorDailyRow[] {
  return rows.map((r) => mapOne(r, date));
}

function mapOne(r: Record<string, string>, date: string): AnchorDailyRow {
  const get = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = r[k];
      if (v !== undefined && v !== "") return v;
    }
    return null;
  };

  return {
    anchor_id: String(get("主播ID") ?? ""),
    date,
    nickname_snapshot: get("主播昵称", "昵称"),

    total_fan_ticket: parseChineseNumber(get("总音浪")),
    live_fan_ticket_no_guest: parseChineseNumber(get("礼物音浪")),
    property_fan_ticket_no_guest: parseChineseNumber(get("道具音浪")),
    guest_fan_ticket: parseChineseNumber(get("嘉宾音浪")),
    subscribe_fan_ticket: parseChineseNumber(get("会员订阅音浪")),
    pk_fan_ticket: null, // 不在导出 CSV 里

    live_duration_1d: parseDuration(get("开播总时长")),
    valid_live_duration_1d: parseDuration(get("开播有效时长")),
    is_solo_valid_day: numOrNull(get("视频个播有效天")),
    feed_watch_duration_1d: parseDuration(get("feed看播时长")),

    feed_acu: numOrNull(get("feed_acu")),
    peak_per_minute_ucnt: numOrNull(get("人气峰值")),

    total_fans: parseChineseNumber(get("粉丝数")),
    new_follow_fans_1d: numOrNull(get("涨粉")),

    video_view_count: parseChineseNumber(get("视频播放量")),
    video_like_count: parseChineseNumber(get("视频点赞量")),
    video_comment_count: parseChineseNumber(get("视频评论量")),

    current_percent: parsePercentOrNum(get("分成比-直播音浪收益")),
    profit_share_ratio: parsePercent(get("会员收益比例")),

    broker_snapshot: get("运营经纪人", "经纪人"),
    signing_type_snapshot: get("签约类型"),
    last_live_time_snapshot: get("上次开播时间"),
    is_new: null,

    anchor_info: get("主播标签"),
    star_guard_earn_score: parseChineseNumber(get("星守护音浪")),
    stat_guard_enter_account_earn_score: parseChineseNumber(get("星守护入账音浪")),

    raw: r as Record<string, unknown>,
  };
}

function numOrNull(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parsePercentOrNum(v: string | null): number | null {
  if (!v) return null;
  if (v.endsWith("%")) return parsePercent(v);
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n > 1 ? n / 100 : n;
}
