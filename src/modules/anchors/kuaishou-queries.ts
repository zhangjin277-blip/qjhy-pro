import "server-only";
import { db } from "@/db/client";
import { kuaishou_live_session } from "@/db/schema";
import { and, eq, sql, gte, type SQL } from "drizzle-orm";

export interface KuaishouAnchorListFilters {
  product?: string;
  search?: string;
  /** 时间窗起始日期 ISO "YYYY-MM-DD"（CST），含 */
  dateFrom?: string;
  /** 时间窗结束日期 ISO "YYYY-MM-DD"（CST），含 */
  dateTo?: string;
  /** 兼容老调用：传 daysBack 等价于 dateFrom=今天-(N-1) dateTo=今天。dateFrom/To 优先 */
  daysBack?: number;
  /** 数据源过滤：'all'（默认） / 'today'（仅今日实时） / 'history'（仅历史权威） */
  dataSource?: "all" | "today" | "history";
}

function dateRangeToMs(filters: KuaishouAnchorListFilters): { startMs: number; endMs: number } {
  if (filters.dateFrom && filters.dateTo) {
    return {
      startMs: new Date(`${filters.dateFrom}T00:00:00+08:00`).getTime(),
      endMs: new Date(`${filters.dateTo}T23:59:59.999+08:00`).getTime(),
    };
  }
  const days = filters.daysBack ?? 7;
  const cutoff = new Date(Date.now() - days * 86400_000);
  return { startMs: cutoff.getTime(), endMs: Date.now() };
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
  // 按时间窗聚合的指标（来自 kuaishou_live_session）
  // 直播表现 - 基础
  session_count: number;
  total_amt: number;
  avg_acu: number;
  max_peak: number;
  total_add_fans: number;
  total_duration_h: number;
  // 流量 - 扩展
  total_play_uv: number;
  total_play_user_cnt: number;
  avg_play_rate: number; // 小数 0.3145
  avg_per_play_time_min: number;
  // 涨粉 - 扩展
  total_follow_author: number;
  total_cancel_follow: number;
  avg_transfer_fans_rate: number; // 小数
  // 互动
  total_like_cnt: number;
  total_comment_cnt: number;
  total_share_cnt: number;
  avg_like_rate: number; // 小数
  avg_comment_rate: number; // 小数
  // 送礼
  total_send_gift_uv: number;
  total_sent_gift_cnt: number;
  total_live_video_amt: number;
  total_live_chat_room_amt: number;
  // 违规
  total_report_num: number;
  avg_report_rate: number;
  // 流量 - 补
  avg_live_cover_ctr: number;
  // 涨粉 - 补
  max_fans_club_cnt: number;
  // 互动 - 补
  total_like_uv: number;
  total_comment_uv: number;
  avg_share_rate: number;
  total_share_uv: number;
  total_interact_num: number;
  avg_interact_rate: number;
  // today_extra - 画像 / 分级 / 状态（取最新一场 today_extra）
  fans_most_age: string | null;
  fans_male_rate: number | null;
  fans_most_province: string | null;
  author_type: string | null;
  author_ratio: number | null;
  has_promote: boolean | null;
  has_punish: boolean | null;
  settle_in_time: number | null;
  settle_province: string | null;
  // 投放数据（按 platform_account_id → live_account → placement_row 聚合，没合并 stub 的为 0）
  total_cost: number;
  total_activations: number;
  total_payment: number;
}

export interface KuaishouAnchorKpi {
  total: number;
  withAgent: number;
  contractExpiringIn90Days: number;
  renewalPending: number;
  // 按时间窗聚合的 KPI
  totalSessions: number;
  totalAmt: number;
  totalAddFans: number;
  // 同期对比（前同长度时间段）
  prevTotalSessions: number;
  prevTotalAmt: number;
  prevTotalAddFans: number;
}

/**
 * 列同期前段（等长时间窗）的主播聚合数据 — 用于行级同比 chip。
 * 复用 listKuaishouAnchors 的实现，把 dateFrom/dateTo 平移到前段。
 */
export async function listKuaishouAnchorsPrev(
  userId: string,
  filters: KuaishouAnchorListFilters = {},
): Promise<KuaishouAnchorRow[]> {
  const { startMs, endMs } = dateRangeToMs(filters);
  const lengthMs = endMs - startMs;
  const prevEndMs = startMs - 1;
  const prevStartMs = prevEndMs - lengthMs;
  const prevDateFrom = new Date(prevStartMs + 8 * 3600_000).toISOString().slice(0, 10);
  const prevDateTo = new Date(prevEndMs + 8 * 3600_000).toISOString().slice(0, 10);
  return listKuaishouAnchors(userId, {
    ...filters,
    dateFrom: prevDateFrom,
    dateTo: prevDateTo,
    daysBack: undefined,
  });
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
  const { startMs, endMs } = dateRangeToMs(filters);
  const dataSource = filters.dataSource ?? "all";
  // 投放数据用 CST 日期窗口（placement_row.date 是 DATE 类型）
  const placementDateFrom = filters.dateFrom ?? new Date(startMs).toISOString().slice(0, 10);
  const placementDateTo = filters.dateTo ?? new Date(endMs).toISOString().slice(0, 10);

  // 用 m. 引用 alias，不能用 drizzle 表对象（会渲染成 "kuaishou_member"."xxx" 跟 alias 冲突）
  const conds: SQL[] = [];
  if (filters.product && filters.product !== "all") {
    // effective product: manual_product 优先于 inferred_product
    if (filters.product === "未分类") {
      conds.push(sql`COALESCE(m.manual_product, m.inferred_product) IS NULL`);
    } else {
      conds.push(sql`COALESCE(m.manual_product, m.inferred_product) = ${filters.product}`);
    }
  }
  if (filters.search) {
    const s = `%${filters.search}%`;
    conds.push(sql`(m.member_name ILIKE ${s} OR m.user_id ILIKE ${s})`);
  }

  const where = conds.length > 0 ? and(...conds) : undefined;

  // 单次查询：member 表 LEFT JOIN dingtalk + LEFT JOIN session 聚合（按时间窗）
  // play_rate / transfer_fans_rate / like_rate / comment_rate 在 DB 是 "31.45%" 字符串，
  // 用 NULLIF + regexp_replace 转 numeric 再 AVG，结果是小数（0.3145）。
  const result = await db.execute<{
    user_id: string;
    member_name: string;
    avatar: string | null;
    fans_count: number | null;
    broker_name_raw: string | null;
    agent_dingtalk_user_id: string | null;
    agent_name: string | null;
    inferred_product: string | null;
    joined_at: string | null;
    contract_expire_at: string | null;
    renewal_status: string | null;
    living_url: string | null;
    updated_at: Date;
    session_count: number;
    total_amt: number;
    avg_acu: number;
    max_peak: number;
    total_add_fans: number;
    total_duration_ms: number;
    total_play_uv: number;
    total_play_user_cnt: number;
    avg_play_rate: number;
    avg_per_play_time_ms: number;
    total_follow_author: number;
    total_cancel_follow: number;
    avg_transfer_fans_rate: number;
    total_like_cnt: number;
    total_comment_cnt: number;
    total_share_cnt: number;
    avg_like_rate: number;
    avg_comment_rate: number;
    total_send_gift_uv: number;
    total_sent_gift_cnt: number;
    total_report_num: number;
    avg_live_cover_ctr: number;
    max_fans_club_cnt: number;
    total_like_uv: number;
    total_comment_uv: number;
    avg_share_rate: number;
    total_share_uv: number;
    total_interact_num: number;
    avg_interact_rate: number;
    total_live_video_amt: number;
    total_live_chat_room_amt: number;
    avg_report_rate: number;
    fans_most_age: string | null;
    fans_male_rate: number | null;
    fans_most_province: string | null;
    author_type: string | null;
    author_ratio: number | null;
    has_promote: boolean | null;
    has_punish: boolean | null;
    settle_in_time: number | null;
    settle_province: string | null;
    total_cost: number;
    total_activations: number;
    total_payment: number;
  }>(sql`
    SELECT
      m.user_id, m.member_name, m.avatar, m.fans_count, m.broker_name_raw,
      m.agent_dingtalk_user_id, du.name AS agent_name,
      COALESCE(m.manual_product, m.inferred_product) AS inferred_product,
      m.joined_at, m.contract_expire_at, m.renewal_status,
      m.living_url, m.updated_at,
      COALESCE(s.session_count, 0)::int                 AS session_count,
      COALESCE(s.total_amt, 0)::float                   AS total_amt,
      COALESCE(s.avg_acu, 0)::float                     AS avg_acu,
      COALESCE(s.max_peak, 0)::int                      AS max_peak,
      COALESCE(s.total_add_fans, 0)::int                AS total_add_fans,
      COALESCE(s.total_duration_ms, 0)::float           AS total_duration_ms,
      COALESCE(s.total_play_uv, 0)::int                 AS total_play_uv,
      COALESCE(s.total_play_user_cnt, 0)::int           AS total_play_user_cnt,
      COALESCE(s.avg_play_rate, 0)::float               AS avg_play_rate,
      COALESCE(s.avg_per_play_time_ms, 0)::float        AS avg_per_play_time_ms,
      COALESCE(s.total_follow_author, 0)::int           AS total_follow_author,
      COALESCE(s.total_cancel_follow, 0)::int           AS total_cancel_follow,
      COALESCE(s.avg_transfer_fans_rate, 0)::float      AS avg_transfer_fans_rate,
      COALESCE(s.total_like_cnt, 0)::int                AS total_like_cnt,
      COALESCE(s.total_comment_cnt, 0)::int             AS total_comment_cnt,
      COALESCE(s.total_share_cnt, 0)::int               AS total_share_cnt,
      COALESCE(s.avg_like_rate, 0)::float               AS avg_like_rate,
      COALESCE(s.avg_comment_rate, 0)::float            AS avg_comment_rate,
      COALESCE(s.total_send_gift_uv, 0)::int            AS total_send_gift_uv,
      COALESCE(s.total_sent_gift_cnt, 0)::int           AS total_sent_gift_cnt,
      COALESCE(s.total_report_num, 0)::int              AS total_report_num,
      COALESCE(s.avg_live_cover_ctr, 0)::float          AS avg_live_cover_ctr,
      COALESCE(s.max_fans_club_cnt, 0)::int             AS max_fans_club_cnt,
      COALESCE(s.total_like_uv, 0)::int                 AS total_like_uv,
      COALESCE(s.total_comment_uv, 0)::int              AS total_comment_uv,
      COALESCE(s.avg_share_rate, 0)::float              AS avg_share_rate,
      COALESCE(s.total_share_uv, 0)::int                AS total_share_uv,
      COALESCE(s.total_interact_num, 0)::int            AS total_interact_num,
      COALESCE(s.avg_interact_rate, 0)::float           AS avg_interact_rate,
      COALESCE(s.total_live_video_amt, 0)::float        AS total_live_video_amt,
      COALESCE(s.total_live_chat_room_amt, 0)::float    AS total_live_chat_room_amt,
      COALESCE(s.avg_report_rate, 0)::float             AS avg_report_rate,
      lt.fans_most_age, lt.fans_male_rate, lt.fans_most_province,
      lt.author_type, lt.author_ratio,
      lt.has_promote, lt.has_punish, lt.settle_in_time, lt.settle_province
    FROM kuaishou_member m
    LEFT JOIN dingtalk_user du ON du.user_id = m.agent_dingtalk_user_id
    LEFT JOIN (
      SELECT DISTINCT ON (member_id)
        member_id,
        today_extra->>'fansMostAge' AS fans_most_age,
        NULLIF(today_extra->>'fansMaleRate','')::numeric / 100 AS fans_male_rate,
        today_extra->>'fansMostProvince' AS fans_most_province,
        today_extra->>'authorType' AS author_type,
        NULLIF(today_extra->>'ratio','')::numeric / 100 AS author_ratio,
        NULLIF(today_extra->>'hasPromote','')::boolean AS has_promote,
        NULLIF(today_extra->>'hasPunish','')::boolean AS has_punish,
        NULLIF(today_extra->>'settleInTime','')::numeric AS settle_in_time,
        today_extra->>'settleProvince' AS settle_province
      FROM kuaishou_live_session
      WHERE today_extra IS NOT NULL
      ORDER BY member_id, start_datetime DESC
    ) lt ON lt.member_id = m.user_id
    LEFT JOIN (
      SELECT
        member_id,
        COUNT(*) AS session_count,
        SUM(live_amt) AS total_amt,
        AVG(valid_acu) AS avg_acu,
        MAX(max_concurrent_user_num) AS max_peak,
        SUM(add_fans_cnt) AS total_add_fans,
        SUM(live_duration_ms) AS total_duration_ms,
        SUM(play_uv) AS total_play_uv,
        SUM(play_user_cnt) AS total_play_user_cnt,
        AVG(NULLIF(regexp_replace(play_rate, '%$', ''), '')::numeric) / 100 AS avg_play_rate,
        AVG(per_play_time_avg_ms) AS avg_per_play_time_ms,
        SUM(follow_author_num) AS total_follow_author,
        SUM(cancel_follow_author_num) AS total_cancel_follow,
        AVG(NULLIF(regexp_replace(transfer_fans_rate, '%$', ''), '')::numeric) / 100 AS avg_transfer_fans_rate,
        SUM(like_cnt) AS total_like_cnt,
        SUM(comment_cnt) AS total_comment_cnt,
        SUM(share_cnt) AS total_share_cnt,
        AVG(NULLIF(regexp_replace(like_rate, '%$', ''), '')::numeric) / 100 AS avg_like_rate,
        AVG(NULLIF(regexp_replace(comment_rate, '%$', ''), '')::numeric) / 100 AS avg_comment_rate,
        SUM(send_gift_uv) AS total_send_gift_uv,
        SUM(sent_gift_cnt) AS total_sent_gift_cnt,
        SUM(report_num) AS total_report_num,
        AVG(NULLIF(regexp_replace(live_cover_ctr, '%$', ''), '')::numeric) / 100 AS avg_live_cover_ctr,
        MAX(fans_club_cnt) AS max_fans_club_cnt,
        SUM(like_uv) AS total_like_uv,
        SUM(comment_uv) AS total_comment_uv,
        AVG(NULLIF(regexp_replace(share_rate, '%$', ''), '')::numeric) / 100 AS avg_share_rate,
        SUM(share_uv) AS total_share_uv,
        SUM(interact_num) AS total_interact_num,
        AVG(NULLIF(regexp_replace(interact_rate, '%$', ''), '')::numeric) / 100 AS avg_interact_rate,
        SUM(live_video_amt) AS total_live_video_amt,
        SUM(live_chat_room_amt) AS total_live_chat_room_amt,
        AVG(NULLIF(regexp_replace(report_rate, '%$', ''), '')::numeric) / 100 AS avg_report_rate
      FROM kuaishou_live_session
      WHERE start_datetime >= to_timestamp(${startMs / 1000})
        AND start_datetime <= to_timestamp(${endMs / 1000})
        ${
          dataSource === "today"
            ? sql`AND data_source = 'today'`
            : dataSource === "history"
              ? sql`AND data_source = 'history'`
              : sql``
        }
      GROUP BY member_id
    ) s ON s.member_id = m.user_id
    LEFT JOIN (
      SELECT
        la.platform_account_id AS member_id,
        SUM(pr.cost_yuan)::float        AS total_cost,
        SUM(pr.activations)::int        AS total_activations,
        SUM(pr.payment_yuan)::float     AS total_payment
      FROM live_account la
      JOIN placement_row pr ON pr.live_account_id = la.id
      WHERE la.platform = '快手'
        AND la.platform_account_id IS NOT NULL
        AND pr.date >= ${placementDateFrom}::date
        AND pr.date <= ${placementDateTo}::date
      GROUP BY la.platform_account_id
    ) pl ON pl.member_id = m.user_id
    ${where ? sql`WHERE ${where}` : sql``}
    ORDER BY m.fans_count DESC NULLS LAST
  `);

  return result.map((r) => ({
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
    session_count: Number(r.session_count),
    total_amt: Number(r.total_amt),
    avg_acu: Number(r.avg_acu),
    max_peak: Number(r.max_peak),
    total_add_fans: Number(r.total_add_fans),
    total_duration_h: Number(r.total_duration_ms) / 3600_000,
    total_play_uv: Number(r.total_play_uv),
    total_play_user_cnt: Number(r.total_play_user_cnt),
    avg_play_rate: Number(r.avg_play_rate),
    avg_per_play_time_min: Number(r.avg_per_play_time_ms) / 60_000,
    total_follow_author: Number(r.total_follow_author),
    total_cancel_follow: Number(r.total_cancel_follow),
    avg_transfer_fans_rate: Number(r.avg_transfer_fans_rate),
    total_like_cnt: Number(r.total_like_cnt),
    total_comment_cnt: Number(r.total_comment_cnt),
    total_share_cnt: Number(r.total_share_cnt),
    avg_like_rate: Number(r.avg_like_rate),
    avg_comment_rate: Number(r.avg_comment_rate),
    total_send_gift_uv: Number(r.total_send_gift_uv),
    total_sent_gift_cnt: Number(r.total_sent_gift_cnt),
    total_report_num: Number(r.total_report_num),
    avg_live_cover_ctr: Number(r.avg_live_cover_ctr),
    max_fans_club_cnt: Number(r.max_fans_club_cnt),
    total_like_uv: Number(r.total_like_uv),
    total_comment_uv: Number(r.total_comment_uv),
    avg_share_rate: Number(r.avg_share_rate),
    total_share_uv: Number(r.total_share_uv),
    total_interact_num: Number(r.total_interact_num),
    avg_interact_rate: Number(r.avg_interact_rate),
    total_live_video_amt: Number(r.total_live_video_amt),
    total_live_chat_room_amt: Number(r.total_live_chat_room_amt),
    avg_report_rate: Number(r.avg_report_rate),
    fans_most_age: r.fans_most_age,
    fans_male_rate: r.fans_male_rate == null ? null : Number(r.fans_male_rate),
    fans_most_province: r.fans_most_province,
    author_type: r.author_type,
    author_ratio: r.author_ratio == null ? null : Number(r.author_ratio),
    has_promote: r.has_promote,
    has_punish: r.has_punish,
    settle_in_time: r.settle_in_time == null ? null : Number(r.settle_in_time),
    settle_province: r.settle_province,
    // 投放数据（待实现 placement_row join；暂填 0 兼容 type）
    total_cost: 0,
    total_activations: 0,
    total_payment: 0,
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
  let totalSessions = 0;
  let totalAmt = 0;
  let totalAddFans = 0;
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
    totalSessions += r.session_count;
    totalAmt += r.total_amt;
    totalAddFans += r.total_add_fans;
  }

  // 前同期：再查一次按等长前段时间窗的聚合
  const { startMs: curStartMs, endMs: curEndMs } = dateRangeToMs(filters);
  const lengthMs = curEndMs - curStartMs;
  const prevEndMs = curStartMs - 1; // 窗口前一天
  const prevStartMs = prevEndMs - lengthMs;
  const prevResult = await db.execute<{
    sessions: number;
    amt: number;
    add_fans: number;
  }>(sql`
    SELECT
      COALESCE(COUNT(*), 0)::int AS sessions,
      COALESCE(SUM(live_amt), 0)::float AS amt,
      COALESCE(SUM(add_fans_cnt), 0)::int AS add_fans
    FROM kuaishou_live_session
    WHERE start_datetime >= to_timestamp(${prevStartMs / 1000})
      AND start_datetime <= to_timestamp(${prevEndMs / 1000})
  `);
  const prev = prevResult[0] ?? { sessions: 0, amt: 0, add_fans: 0 };

  return {
    total: rows.length,
    withAgent,
    contractExpiringIn90Days,
    renewalPending,
    totalSessions,
    totalAmt,
    totalAddFans,
    prevTotalSessions: Number(prev.sessions),
    prevTotalAmt: Number(prev.amt),
    prevTotalAddFans: Number(prev.add_fans),
  };
}

/* ========== 主播单场直播明细（抽屉用） ==========
 * row 字段命名跟 KuaishouRow（主表聚合）对齐，方便抽屉直接用 visibleColumns 渲染。
 * 单场聚合语义：max_peak/avg_acu 等"max/avg" 字段 = 该单场的值，并非聚合。
 */

export interface KuaishouLiveSessionRow {
  // 元数据
  live_stream_id: string; // bigint → string 序列化
  title: string | null;
  cover_url: string | null;
  start_datetime: string; // ISO 字符串
  end_datetime: string | null;
  live_duration_text: string | null;
  data_source: string;
  // 主表 ColKey 对应的值（单场粒度）
  total_amt: number | null;
  avg_acu: number | null;
  max_peak: number | null;
  total_add_fans: number | null;
  total_duration_h: number | null;
  total_play_uv: number | null;
  total_play_user_cnt: number | null;
  avg_play_rate: number | null;
  avg_per_play_time_min: number | null;
  avg_live_cover_ctr: number | null;
  total_follow_author: number | null;
  total_cancel_follow: number | null;
  avg_transfer_fans_rate: number | null;
  max_fans_club_cnt: number | null;
  total_like_cnt: number | null;
  total_like_uv: number | null;
  avg_like_rate: number | null;
  total_comment_cnt: number | null;
  total_comment_uv: number | null;
  avg_comment_rate: number | null;
  total_share_cnt: number | null;
  total_share_uv: number | null;
  avg_share_rate: number | null;
  total_interact_num: number | null;
  avg_interact_rate: number | null;
  total_send_gift_uv: number | null;
  total_sent_gift_cnt: number | null;
  total_live_video_amt: number | null;
  total_live_chat_room_amt: number | null;
  total_report_num: number | null;
  avg_report_rate: number | null;
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
  const cutoffMs = Date.now() - daysBack * 86400_000;
  // 用 raw SQL 把 percent 字符串列（"31.45%"）转 numeric/100 ，
  // 同时把 schema 字段名 alias 成主表 KuaishouColKey 风格。
  const rows = await db.execute<{
    live_stream_id: string;
    title: string | null;
    cover_url: string | null;
    start_datetime: Date;
    end_datetime: Date | null;
    live_duration_text: string | null;
    data_source: string;
    total_amt: number | null;
    avg_acu: number | null;
    max_peak: number | null;
    total_add_fans: number | null;
    total_duration_h: number | null;
    total_play_uv: number | null;
    total_play_user_cnt: number | null;
    avg_play_rate: number | null;
    avg_per_play_time_min: number | null;
    avg_live_cover_ctr: number | null;
    total_follow_author: number | null;
    total_cancel_follow: number | null;
    avg_transfer_fans_rate: number | null;
    max_fans_club_cnt: number | null;
    total_like_cnt: number | null;
    total_like_uv: number | null;
    avg_like_rate: number | null;
    total_comment_cnt: number | null;
    total_comment_uv: number | null;
    avg_comment_rate: number | null;
    total_share_cnt: number | null;
    total_share_uv: number | null;
    avg_share_rate: number | null;
    total_interact_num: number | null;
    avg_interact_rate: number | null;
    total_send_gift_uv: number | null;
    total_sent_gift_cnt: number | null;
    total_live_video_amt: number | null;
    total_live_chat_room_amt: number | null;
    total_report_num: number | null;
    avg_report_rate: number | null;
  }>(sql`
    SELECT
      live_stream_id::text                        AS live_stream_id,
      title, cover_url, start_datetime, end_datetime,
      live_duration_text, data_source,
      live_amt::float                             AS total_amt,
      valid_acu::float                            AS avg_acu,
      max_concurrent_user_num                     AS max_peak,
      add_fans_cnt                                AS total_add_fans,
      (live_duration_ms / 3600000.0)::float       AS total_duration_h,
      play_uv                                     AS total_play_uv,
      play_user_cnt                               AS total_play_user_cnt,
      (NULLIF(regexp_replace(play_rate, '%$', ''), '')::numeric / 100)::float AS avg_play_rate,
      (per_play_time_avg_ms / 60000.0)::float     AS avg_per_play_time_min,
      (NULLIF(regexp_replace(live_cover_ctr, '%$', ''), '')::numeric / 100)::float AS avg_live_cover_ctr,
      follow_author_num                           AS total_follow_author,
      cancel_follow_author_num                    AS total_cancel_follow,
      (NULLIF(regexp_replace(transfer_fans_rate, '%$', ''), '')::numeric / 100)::float AS avg_transfer_fans_rate,
      fans_club_cnt                               AS max_fans_club_cnt,
      like_cnt                                    AS total_like_cnt,
      like_uv                                     AS total_like_uv,
      (NULLIF(regexp_replace(like_rate, '%$', ''), '')::numeric / 100)::float AS avg_like_rate,
      comment_cnt                                 AS total_comment_cnt,
      comment_uv                                  AS total_comment_uv,
      (NULLIF(regexp_replace(comment_rate, '%$', ''), '')::numeric / 100)::float AS avg_comment_rate,
      share_cnt                                   AS total_share_cnt,
      share_uv                                    AS total_share_uv,
      (NULLIF(regexp_replace(share_rate, '%$', ''), '')::numeric / 100)::float AS avg_share_rate,
      interact_num                                AS total_interact_num,
      (NULLIF(regexp_replace(interact_rate, '%$', ''), '')::numeric / 100)::float AS avg_interact_rate,
      send_gift_uv                                AS total_send_gift_uv,
      sent_gift_cnt                               AS total_sent_gift_cnt,
      live_video_amt::float                       AS total_live_video_amt,
      live_chat_room_amt::float                   AS total_live_chat_room_amt,
      report_num                                  AS total_report_num,
      (NULLIF(regexp_replace(report_rate, '%$', ''), '')::numeric / 100)::float AS avg_report_rate
    FROM kuaishou_live_session
    WHERE member_id = ${memberId}
      AND start_datetime >= to_timestamp(${cutoffMs / 1000})
    ORDER BY start_datetime DESC
  `);

  return rows.map((r) => ({
    ...r,
    start_datetime:
      r.start_datetime instanceof Date ? r.start_datetime.toISOString() : String(r.start_datetime),
    end_datetime:
      r.end_datetime instanceof Date
        ? r.end_datetime.toISOString()
        : r.end_datetime == null
          ? null
          : String(r.end_datetime),
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
