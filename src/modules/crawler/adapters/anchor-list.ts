import "server-only";
import type { Page } from "puppeteer-core";
import { pageFetch } from "@/lib/puppeteer";

const ENDPOINT = "https://union.bytedance.com/ark/api/uanchor/anchor_list/list";

export interface AnchorProfileRow {
  anchor_id: string;
  nick_name: string;
  avatar: string | null;
  gender: number | null;
  aweme_display_id: string | null;
  aweme_short_id: string | null;
  hotsoon_display_id: string | null;
  hotsoon_short_id: string | null;
  xigua_display_id: string | null;
  real_name: string | null;
  last_live_time: number | null;
  live_status: number | null;
  anchor_health_score: number | null;
  anchor_health_score_level: number | null;
  anchor_ban_30d: number | null;
  anchor_violation_30d: number | null;
  notes: string | null;
  anchor_sign_type: number | null;
  anchor_sign_out: number | null;
  signing_time: number | null;
  sign_start_time: number | null;
  sign_end_time: number | null;
  union_member_end_date: number | null;
  auto_renewal: boolean | null;
  join_time: number | null;
  first_live_time_in_faction: number | null;
  leave_time: number | null;
  wait_for_leave: boolean | null;
  have_operate_relation: boolean | null;
  have_recruit_relation: boolean | null;
  broker_id: string | null;
  broker_name: string | null;
  recruit_broker_id: string | null;
  recruit_broker_name: string | null;
  income_percent: number | null;
  percent_map: Record<string, string> | null;
  misc: Record<string, unknown>;
  is_threekingdoms: boolean;
  raw: Record<string, unknown>;
}

export interface RawListResponse {
  status_code: number;
  data: { list: Record<string, unknown>[]; total_amount: number };
}

/**
 * 从平台 API 抓取分页主播列表，自动翻页直到拉完。
 */
export async function fetchAnchorList(page: Page): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let pageNum = 1;
  const size = 50;
  while (true) {
    const url = `${ENDPOINT}?vertical_type=0&sort_tag=5&is_increasing=false&page=${pageNum}&size=${size}`;
    const res = await pageFetch<RawListResponse>(page, url, {
      headers: { "X-Appid": "3000" },
    });
    if (res.status_code !== 0) {
      throw new Error(`anchor_list/list failed: code=${res.status_code}`);
    }
    all.push(...res.data.list);
    if (all.length >= res.data.total_amount) break;
    pageNum++;
    if (pageNum > 100) break; // safety
    await new Promise((r) => setTimeout(r, 300));
  }
  return all;
}

/**
 * 把平台返回的单条 record（嵌套对象 + 平铺字段）解构为 anchor_profile 表行。
 */
export function parseAnchorListResponse(raw: RawListResponse): AnchorProfileRow[] {
  return raw.data.list.map((r) => mapOne(r));
}

function mapOne(r: Record<string, unknown>): AnchorProfileRow {
  const baseInfo = (r.anchor_base_info ?? {}) as Record<string, unknown>;
  const factionInfo = (r.anchor_faction_info ?? {}) as Record<string, unknown>;
  const card = (r.anchor_card ?? {}) as Record<string, unknown>;
  const signing = (r.signing_info ?? {}) as Record<string, unknown>;

  const recruit_broker_name = (factionInfo.recruit_broker_name as string) ?? null;

  return {
    anchor_id: String(baseInfo.anchor_id ?? r.anchor_id ?? ""),
    nick_name: String(baseInfo.nick_name ?? ""),
    avatar: (baseInfo.avatar as string) ?? null,
    gender: numOrNull(baseInfo.gender),
    aweme_display_id: strOrNull(baseInfo.aweme_display_id),
    aweme_short_id: strOrNull(baseInfo.aweme_short_id),
    hotsoon_display_id: strOrNull(baseInfo.hotsoon_display_id),
    hotsoon_short_id: strOrNull(baseInfo.hotsoon_short_id),
    xigua_display_id: strOrNull(baseInfo.xigua_display_id),
    real_name: strOrNull(baseInfo.real_name),

    last_live_time: numOrNull(r.last_live_time),
    live_status: numOrNull(card.live_status),
    anchor_health_score: numOrNull(baseInfo.anchor_health_score),
    anchor_health_score_level: numOrNull(baseInfo.anchor_health_score_level),
    anchor_ban_30d: numOrNull(card.anchor_ban_30d),
    anchor_violation_30d: numOrNull(card.anchor_violation_30d),
    notes: strOrNull(baseInfo.notes),

    anchor_sign_type: numOrNull(r.anchor_sign_type),
    anchor_sign_out: numOrNull(r.anchor_sign_out),
    signing_time: numOrNull(signing.signing_time),
    sign_start_time: numOrNull(factionInfo.sign_start_time),
    sign_end_time: numOrNull(factionInfo.sign_end_time),
    union_member_end_date: numOrNull(baseInfo.union_member_end_date),
    auto_renewal: boolOrNull(factionInfo.auto_renewal),
    join_time: numOrNull(factionInfo.join_time),
    first_live_time_in_faction: numOrNull(factionInfo.first_live_time_in_faction),
    leave_time: numOrNull(factionInfo.leave_time),
    wait_for_leave: boolOrNull(factionInfo.wait_for_leave),
    have_operate_relation: boolOrNull(r.have_operate_relation),
    have_recruit_relation: boolOrNull(r.have_recruit_relation),

    broker_id: strOrNull(factionInfo.broker_id),
    broker_name: strOrNull(factionInfo.broker_name),
    recruit_broker_id: strOrNull(factionInfo.recruit_broker_id),
    recruit_broker_name,

    income_percent: pctOrNull(signing.income_percent),
    percent_map: (signing.percent_map as Record<string, string>) ?? null,

    misc: {
      anchor_identity_type: r.anchor_identity_type,
      anchor_type: r.anchor_type,
      content_type: r.content_type,
      current_live_style: r.current_live_style,
      current_live_style_sub_type: r.current_live_style_sub_type,
      introduce_level: r.introduce_level,
      introduce_type: r.introduce_type,
      is_batch_live: r.is_batch_live,
      is_faction_pid_bound: r.is_faction_pid_bound,
      is_broker_follow: r.is_broker_follow,
      share_percent_modify: r.share_percent_modify,
      union_anchor_mark_type_list: r.union_anchor_mark_type_list,
      broker_rights: r.broker_rights,
      tz_link_cnt: r.tz_link_cnt,
      tz_link_recharge_consume_diamond: r.tz_link_recharge_consume_diamond,
      personal_live_income: r.personal_live_income,
      personal_live_interrupt_day: r.personal_live_interrupt_day,
      personal_live_valid_day: r.personal_live_valid_day,
      personal_live_valid_duration: r.personal_live_valid_duration,
    },

    is_threekingdoms: recruit_broker_name === "三国项目",
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

function boolOrNull(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  return Boolean(v);
}

function pctOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  // 平台返回 0-100 还是 0-1 不一定，看实际样本——income_percent 是整数百分比
  return n > 1 ? n / 100 : n;
}
