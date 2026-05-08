import "server-only";
import { db } from "@/db/client";
import { kuaishou_member, kuaishou_live_session, dingtalk_user } from "@/db/schema";
import { and, eq, isNull, sql, desc, gte, type SQL } from "drizzle-orm";

export interface KuaishouAnchorListFilters {
  product?: string;
  search?: string;
}

export interface KuaishouAnchorRow {
  id: string;
  account_name: string;
  platform_account_id: string;
  avatar: string | null;
  product: string;
  agent_dingtalk_user_id: string | null;
  agent_name: string | null;
  fans_count: number | null;
  joined_at: string | null;
  contract_expire_at: string | null;
  renewal_status: string | null;
  broker_name_raw: string | null;
  live_status: string;
  updated_at: Date;
}

export interface KuaishouAnchorKpi {
  total: number;
  withAgent: number;
  contractExpiringIn90Days: number;
  renewalPending: number;
}

/**
 * 主播明细列表（公会全量数据，独立于 live_account）。
 * 主播明细 = kuaishou_member 全表，按 product/search 筛选。
 *
 * 注意：暂时不做 perm scope 过滤（公会成员是基础信息）。emergencyMode 仅用于保留原 API 签名兼容。
 */
export async function listKuaishouAnchors(
  _userId: string,
  filters: KuaishouAnchorListFilters = {},
  _emergencyMode = false,
): Promise<KuaishouAnchorRow[]> {
  const conds: SQL[] = [];
  if (filters.product && filters.product !== "all") {
    if (filters.product === "未分类") {
      conds.push(isNull(kuaishou_member.inferred_product));
    } else {
      conds.push(eq(kuaishou_member.inferred_product, filters.product));
    }
  }
  if (filters.search) {
    const s = `%${filters.search}%`;
    conds.push(
      sql`(${kuaishou_member.member_name} ILIKE ${s} OR ${kuaishou_member.user_id} ILIKE ${s})`,
    );
  }

  const where = conds.length > 0 ? and(...conds) : undefined;

  const rows = await db
    .select({
      user_id: kuaishou_member.user_id,
      member_name: kuaishou_member.member_name,
      avatar: kuaishou_member.avatar,
      fans_count: kuaishou_member.fans_count,
      broker_name_raw: kuaishou_member.broker_name_raw,
      agent_dingtalk_user_id: kuaishou_member.agent_dingtalk_user_id,
      agent_name: dingtalk_user.name,
      inferred_product: kuaishou_member.inferred_product,
      joined_at: kuaishou_member.joined_at,
      contract_expire_at: kuaishou_member.contract_expire_at,
      renewal_status: kuaishou_member.renewal_status,
      last_live_time: kuaishou_member.last_live_time,
      living_url: kuaishou_member.living_url,
      updated_at: kuaishou_member.updated_at,
    })
    .from(kuaishou_member)
    .leftJoin(dingtalk_user, eq(kuaishou_member.agent_dingtalk_user_id, dingtalk_user.user_id))
    .where(where)
    .orderBy(sql`${kuaishou_member.fans_count} DESC NULLS LAST`);

  return rows.map((r) => ({
    id: r.user_id,
    account_name: r.member_name,
    platform_account_id: r.user_id,
    avatar: r.avatar,
    product: r.inferred_product ?? "未分类",
    agent_dingtalk_user_id: r.agent_dingtalk_user_id,
    agent_name: r.agent_name,
    fans_count: r.fans_count,
    joined_at: r.joined_at,
    contract_expire_at: r.contract_expire_at,
    renewal_status: r.renewal_status,
    broker_name_raw: r.broker_name_raw,
    live_status: r.living_url ? "living" : "unknown",
    updated_at: r.updated_at,
  }));
}

export async function queryKuaishouAnchorKpi(
  userId: string,
  filters: KuaishouAnchorListFilters = {},
  emergencyMode = false,
): Promise<KuaishouAnchorKpi> {
  const rows = await listKuaishouAnchors(userId, filters, emergencyMode);
  const today = new Date();
  const ninetyDaysLater = new Date(today.getTime() + 90 * 86400_000);

  let withAgent = 0;
  let contractExpiringIn90Days = 0;
  let renewalPending = 0;
  for (const r of rows) {
    if (r.agent_dingtalk_user_id) withAgent++;
    if (r.contract_expire_at) {
      const exp = new Date(r.contract_expire_at);
      if (exp >= today && exp <= ninetyDaysLater) contractExpiringIn90Days++;
    }
    if (
      r.renewal_status &&
      (r.renewal_status.includes("待确认") || r.renewal_status.includes("可发起续约"))
    ) {
      renewalPending++;
    }
  }

  return {
    total: rows.length,
    withAgent,
    contractExpiringIn90Days,
    renewalPending,
  };
}

/* ========== 主播单场直播明细（抽屉用） ========== */

export interface KuaishouLiveSessionRow {
  live_stream_id: string; // bigint → string 序列化
  title: string | null;
  cover_url: string | null;
  start_datetime: Date;
  end_datetime: Date | null;
  live_duration_ms: number | null;
  live_duration_text: string | null;
  play_uv: number | null;
  play_user_cnt: number | null;
  max_concurrent_user_num: number | null;
  valid_acu: number | null;
  play_rate: string | null;
  per_play_time_avg_text: string | null;
  add_fans_cnt: number | null;
  transfer_fans_rate: string | null;
  like_cnt: number | null;
  comment_cnt: number | null;
  send_gift_uv: number | null;
  live_amt: number | null;
  data_source: string;
}

export interface KuaishouMemberSummary {
  total_sessions: number;
  total_amt: number;
  total_add_fans: number;
  avg_acu: number;
  total_duration_hours: number;
  max_peak: number;
}

/**
 * 列出某主播指定时间窗内的所有场次，按开播时间倒序。
 * 时间窗口语义：「按开播时间归属日期」(start_datetime >= cutoff)，跨日直播算开播日。
 */
export async function listKuaishouLiveSessions(
  memberId: string,
  daysBack = 30,
): Promise<KuaishouLiveSessionRow[]> {
  const cutoff = new Date(Date.now() - daysBack * 86400_000);
  const rows = await db
    .select({
      live_stream_id: kuaishou_live_session.live_stream_id,
      title: kuaishou_live_session.title,
      cover_url: kuaishou_live_session.cover_url,
      start_datetime: kuaishou_live_session.start_datetime,
      end_datetime: kuaishou_live_session.end_datetime,
      live_duration_ms: kuaishou_live_session.live_duration_ms,
      live_duration_text: kuaishou_live_session.live_duration_text,
      play_uv: kuaishou_live_session.play_uv,
      play_user_cnt: kuaishou_live_session.play_user_cnt,
      max_concurrent_user_num: kuaishou_live_session.max_concurrent_user_num,
      valid_acu: kuaishou_live_session.valid_acu,
      play_rate: kuaishou_live_session.play_rate,
      per_play_time_avg_text: kuaishou_live_session.per_play_time_avg_text,
      add_fans_cnt: kuaishou_live_session.add_fans_cnt,
      transfer_fans_rate: kuaishou_live_session.transfer_fans_rate,
      like_cnt: kuaishou_live_session.like_cnt,
      comment_cnt: kuaishou_live_session.comment_cnt,
      send_gift_uv: kuaishou_live_session.send_gift_uv,
      live_amt: kuaishou_live_session.live_amt,
      data_source: kuaishou_live_session.data_source,
    })
    .from(kuaishou_live_session)
    .where(
      and(
        eq(kuaishou_live_session.member_id, memberId),
        gte(kuaishou_live_session.start_datetime, cutoff),
      ),
    )
    .orderBy(desc(kuaishou_live_session.start_datetime));

  return rows.map((r) => ({
    ...r,
    live_stream_id: String(r.live_stream_id),
  }));
}

/** 主播 KPI 汇总（按开播时间归属） */
export async function queryKuaishouMemberSummary(
  memberId: string,
  daysBack = 30,
): Promise<KuaishouMemberSummary> {
  const cutoff = new Date(Date.now() - daysBack * 86400_000);
  const result = await db
    .select({
      total_sessions: sql<number>`COUNT(*)::int`,
      total_amt: sql<number>`COALESCE(SUM(${kuaishou_live_session.live_amt}), 0)::float`,
      total_add_fans: sql<number>`COALESCE(SUM(${kuaishou_live_session.add_fans_cnt}), 0)::int`,
      avg_acu: sql<number>`COALESCE(AVG(${kuaishou_live_session.valid_acu}), 0)::float`,
      total_duration_ms: sql<number>`COALESCE(SUM(${kuaishou_live_session.live_duration_ms}), 0)::float`,
      max_peak: sql<number>`COALESCE(MAX(${kuaishou_live_session.max_concurrent_user_num}), 0)::int`,
    })
    .from(kuaishou_live_session)
    .where(
      and(
        eq(kuaishou_live_session.member_id, memberId),
        gte(kuaishou_live_session.start_datetime, cutoff),
      ),
    );

  const r = result[0];
  if (!r) {
    return {
      total_sessions: 0,
      total_amt: 0,
      total_add_fans: 0,
      avg_acu: 0,
      total_duration_hours: 0,
      max_peak: 0,
    };
  }
  return {
    total_sessions: Number(r.total_sessions),
    total_amt: Number(r.total_amt),
    total_add_fans: Number(r.total_add_fans),
    avg_acu: Number(r.avg_acu),
    total_duration_hours: Number(r.total_duration_ms) / 3600_000,
    max_peak: Number(r.max_peak),
  };
}
