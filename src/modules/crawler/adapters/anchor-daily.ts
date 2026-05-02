import "server-only";
import type { Page } from "puppeteer-core";
import { pageFetch } from "@/lib/puppeteer";
import { parseDuration, parsePercent, parseChineseNumber } from "../parsers";

const ENDPOINT =
  "https://union.bytedance.com/ark/api/data/pugna_component/data/v2/union/data_center/anchor_list";

/**
 * 91 字段全集（meta.field 里 91 项的 key）。
 * fields= 参数显式声明全集，避免平台默认只返 39 字段。
 */
export const ANCHOR_DAILY_FIELDS = [
  "anchorID",
  "nicknameRaw",
  "coverUrlRaw",
  "awemeIDRaw",
  "awemeShortIDRaw",
  "hotsoonIDRaw",
  "hotsoonShortIDRaw",
  "xiguaDisplayIdRaw",
  "totalFansRaw",
  "lastLiveTimeRaw",
  "signingTypeRaw",
  "brokerRaw",
  "anchorTagType",
  "isNew",
  "anchorInfo",
  "totalFanTicket",
  "liveFanTicketWithoutGuest",
  "propertyFanTicketWithoutGuest",
  "guestFanTicket",
  "activityFanTicketWithoutGuest",
  "specialFanTicket",
  "subscribeFanTicket",
  "pkFanTicket",
  "linkScreenFanTicket",
  "linkScreenRoomFanTicket",
  "squareWandererFanTicket",
  "squareNowandererFanTicket",
  "squareNoguestFanTicket",
  "voiceWandererFanTicket",
  "voiceNoguestFanTicket",
  "voiceNowandererFanTicket",
  "voiceChatNoguestFanTicket",
  "voiceChatNowandererFanTicket",
  "voiceChatWandererFanTicket",
  "radioLinkFanTicket",
  "radioLinkFanWithoutGuestTicket",
  "totalTicketOutsideLink",
  "voiceTotalTicketOutsideLink",
  "voiceChatTotalTicketOutsideLink",
  "radioTotalTicketOutsideLink",
  "videoTotalTicketOutsideLink",
  "groupNoMemberFanTicket",
  "groupMemberFanTicket",
  "luckyNumBoxTicket",
  "starGuardEarnScore",
  "starGuardUcnt",
  "statGuardEnterAccountEarnScore",
  "aiCloneFanTicket",
  "aiCloneConsumeUcnt",
  "virtualIncome",
  "virtualPremiumIdentityIncome",
  "liveDuration1d",
  "single25minValidLiveDuration1d",
  "isSingleThan1hLiveValidDay",
  "feedWatchDuration1d",
  "voiceLiveDurationWithoutPause",
  "single25minVoiceLiveDuration",
  "voiceChatLiveDuration1d",
  "voiceChatLinkDuration1d",
  "single25minVoiceChatLiveDuration1d",
  "voiceChatLiveVaildDay",
  "voiceChatLinkVaildDay",
  "squareLiveDurationWithoutPauseVoiceRaw",
  "squareSingle25minValidLiveDurationFromStWithoutPauseVoiceRaw",
  "squareSingle60minValidLiveDayFromStWithoutPauseVoiceRaw",
  "squareLinkDuration1d",
  "squareLiveSingle60minValidLiveDayFromStWithoutPauseVoiceRaw",
  "single60minVoiceLiveCntFromStWithoutPause",
  "validRadioLiveDuration",
  "validRadioLiveDay",
  "radioLiveDuration",
  "virtualLiveDuration",
  "virtualLiveVaildDuration",
  "virtualLiveVaildDay",
  "voiceChatroomConnectNum",
  "voiceGuestConnectNum",
  "voiceGuestConnectValidTimeDuration",
  "voiceGuestConnectIncomeSingleHour",
  "feedAcuRaw",
  "perMinuteUcnt1d",
  "newFollowFansUcnt1d",
  "VideoCountRaw",
  "LikeCountRaw",
  "CommentCountRaw",
  "ViewCountRaw",
  "CurrentPercentRaw",
  "GameSharePercentRaw",
  "PayMoneyConnectSharePercentRaw",
  "profitShareRatio",
  "QrcodeRaw",
  "pkCnt",
  "pkWinCnt",
  "pkScores",
  "pkFinishCnt",
  "pkFanTicketPercent",
] as const;

export interface AnchorDailyRow {
  anchor_id: string;
  date: string;
  nickname_snapshot: string | null;

  total_fan_ticket: number | null;
  live_fan_ticket_no_guest: number | null;
  property_fan_ticket_no_guest: number | null;
  guest_fan_ticket: number | null;
  activity_fan_ticket_no_guest: number | null;
  special_fan_ticket: number | null;
  subscribe_fan_ticket: number | null;
  pk_fan_ticket: number | null;
  link_screen_fan_ticket: number | null;
  link_screen_room_fan_ticket: number | null;

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
  game_share_percent: number | null;
  pay_money_connect_share_percent: number | null;
  profit_share_ratio: number | null;

  broker_snapshot: string | null;
  signing_type_snapshot: string | null;
  last_live_time_snapshot: string | null;
  is_new: number | null;

  anchor_info: string | null;
  star_guard_earn_score: number | null;
  total_ticket_outside_link: number | null;
  stat_guard_enter_account_earn_score: number | null;

  raw: Record<string, unknown>;
}

interface RawDailyResponse {
  data: { data_string: string };
}

export interface ParsedDailyInner {
  data: { series: Record<string, unknown>[] };
  meta: string;
}

export async function fetchAnchorDaily(
  page: Page,
  date: string,
  pageNum = 1,
  size = 100,
): Promise<{ list: Record<string, unknown>[]; total: number }> {
  const fields = ANCHOR_DAILY_FIELDS.join(",");
  const url =
    `${ENDPOINT}?beginDate=${date}&endDate=${date}&page=${pageNum}&size=${size}` +
    `&orderField=totalFanTicket&sortType=desc&fields=${fields}`;
  const res = await pageFetch<RawDailyResponse>(page, url, {
    headers: { "X-Appid": "3000" },
  });
  const inner = JSON.parse(res.data.data_string) as ParsedDailyInner;
  return { list: inner.data.series, total: inner.data.series.length };
}

export function parseAnchorDailyResponse(inner: ParsedDailyInner, date: string): AnchorDailyRow[] {
  return inner.data.series.map((r) => mapOne(r, date));
}

function mapOne(r: Record<string, unknown>, date: string): AnchorDailyRow {
  return {
    anchor_id: String(r.anchorID ?? ""),
    date,
    nickname_snapshot: strOrNull(r.nicknameRaw),

    total_fan_ticket: parseChineseNumber(r.totalFanTicket as string | number),
    live_fan_ticket_no_guest: parseChineseNumber(r.liveFanTicketWithoutGuest as string | number),
    property_fan_ticket_no_guest: parseChineseNumber(
      r.propertyFanTicketWithoutGuest as string | number,
    ),
    guest_fan_ticket: parseChineseNumber(r.guestFanTicket as string | number),
    activity_fan_ticket_no_guest: parseChineseNumber(
      r.activityFanTicketWithoutGuest as string | number,
    ),
    special_fan_ticket: parseChineseNumber(r.specialFanTicket as string | number),
    subscribe_fan_ticket: parseChineseNumber(r.subscribeFanTicket as string | number),
    pk_fan_ticket: parseChineseNumber(r.pkFanTicket as string | number),
    link_screen_fan_ticket: parseChineseNumber(r.linkScreenFanTicket as string | number),
    link_screen_room_fan_ticket: parseChineseNumber(r.linkScreenRoomFanTicket as string | number),

    live_duration_1d: parseDuration(r.liveDuration1d as string),
    valid_live_duration_1d: parseDuration(r.single25minValidLiveDuration1d as string),
    is_solo_valid_day: numOrNull(r.isSingleThan1hLiveValidDay),
    feed_watch_duration_1d: parseDuration(r.feedWatchDuration1d as string),

    feed_acu: numOrNull(r.feedAcuRaw),
    peak_per_minute_ucnt: numOrNull(r.perMinuteUcnt1d),

    total_fans: parseChineseNumber(r.totalFansRaw as string | number),
    new_follow_fans_1d: numOrNull(r.newFollowFansUcnt1d),

    video_view_count: parseChineseNumber(r.ViewCountRaw as string | number),
    video_like_count: parseChineseNumber(r.LikeCountRaw as string | number),
    video_comment_count: parseChineseNumber(r.CommentCountRaw as string | number),

    current_percent: parsePercentOrNum(r.CurrentPercentRaw),
    game_share_percent: parsePercentOrNum(r.GameSharePercentRaw),
    pay_money_connect_share_percent: parsePercentOrNum(r.PayMoneyConnectSharePercentRaw),
    profit_share_ratio: parsePercent(r.profitShareRatio as string),

    broker_snapshot: strOrNull(r.brokerRaw),
    signing_type_snapshot: strOrNull(r.signingTypeRaw),
    last_live_time_snapshot: strOrNull(r.lastLiveTimeRaw),
    is_new: numOrNull(r.isNew),

    anchor_info: strOrNull(r.anchorInfo),
    star_guard_earn_score: parseChineseNumber(r.starGuardEarnScore as string | number),
    total_ticket_outside_link: parseChineseNumber(r.totalTicketOutsideLink as string | number),
    stat_guard_enter_account_earn_score: parseChineseNumber(
      r.statGuardEnterAccountEarnScore as string | number,
    ),

    raw: r,
  };
}

function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parsePercentOrNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") {
    if (v.endsWith("%")) return parsePercent(v);
    const n = Number(v);
    return Number.isFinite(n) ? (n > 1 ? n / 100 : n) : null;
  }
  if (typeof v === "number") return v > 1 ? v / 100 : v;
  return null;
}
