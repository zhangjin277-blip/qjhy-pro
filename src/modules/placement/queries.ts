import "server-only";
import { db } from "@/db/client";
import { eq, sql, type SQL } from "drizzle-orm";
import { dingtalk_user } from "@/db/schema";
import { resolvePermission, getManagedDeptIds } from "@/modules/permissions/server";
import type { ModuleKey } from "@/modules/permissions";
import type { TimeRangeSelection } from "./filter-utils";

/**
 * Placement 数据可见范围（按 placement_row.attributed_dingtalk_user_id 过滤）。
 * 由 page.tsx 入口调 `resolvePlacementScope(userId, isEmergency)` 解析后填进 BoardFilter。
 */
export type PlacementScope =
  | { kind: "all" }
  | { kind: "reject" }
  | { kind: "user_ids"; ids: string[] };

export interface BoardFilter {
  date_from: string; // ISO
  date_to: string; // ISO
  dataset_ids?: string[]; // 默认全部
  search?: string; // 账号名 / 主播名 模糊
  anchor_label?: string; // placement_label 精确筛选（detail 视图）
  view?: "detail" | "summary" | "schedule"; // 当前视图模式
  /** 权限范围；不传等价于 {kind:"all"}（旧调用方兼容；admin 入口可省略） */
  scope?: PlacementScope;
}

function datasetClause(ds?: string[]) {
  if (!ds || ds.length === 0) return sql``;
  return sql`AND p.dataset_id IN (${sql.join(
    ds.map((d) => sql`${d}`),
    sql`, `,
  )})`;
}

/**
 * 返回 `AND ...` 形式的 SQL 片段，注入到现有 WHERE 子句后用。
 * 默认表别名是 `p`（placement_row）；其他场景传 columnRef 覆盖。
 */
function scopeClause(
  scope: PlacementScope | undefined,
  columnRef: SQL = sql`p.attributed_dingtalk_user_id`,
) {
  if (!scope || scope.kind === "all") return sql``;
  if (scope.kind === "reject") return sql`AND FALSE`;
  if (scope.ids.length === 0) return sql`AND FALSE`;
  return sql`AND ${columnRef} = ANY(ARRAY[${sql.join(
    scope.ids.map((id) => sql`${id}`),
    sql`, `,
  )}]::text[])`;
}

/**
 * 解析当前用户在 placement 模块的可见范围。
 * 由 page.tsx 在拿到 dingtalkUserId 后调用，结果塞进 BoardFilter.scope。
 */
export async function resolvePlacementScope(
  userId: string,
  emergencyMode = false,
  module: ModuleKey = "placement",
): Promise<PlacementScope> {
  if (emergencyMode) return { kind: "all" };
  const perm = await resolvePermission(userId, module);
  // 委托视图：直接以这些员工的并集做过滤，绕过 scope
  if (perm.delegatedUserIds && perm.delegatedUserIds.length > 0) {
    return { kind: "user_ids", ids: perm.delegatedUserIds };
  }
  if (perm.scope === "none") return { kind: "reject" };
  if (perm.scope === "all") return { kind: "all" };
  if (perm.scope === "self") return { kind: "user_ids", ids: [userId] };
  // team
  const deptIds = await getManagedDeptIds(userId);
  if (deptIds.length === 0) return { kind: "reject" };
  const teamUsers = await db
    .select({ user_id: dingtalk_user.user_id })
    .from(dingtalk_user)
    .where(
      sql`${dingtalk_user.dept_ids} ?| ${sql.raw(`ARRAY[${deptIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(",")}]::text[]`)}`,
    );
  if (teamUsers.length === 0) return { kind: "reject" };
  return { kind: "user_ids", ids: teamUsers.map((u) => u.user_id) };
}
void eq; // silence unused-import lint if not used elsewhere

// postgres-js 适配器 db.execute 直接返回数组（不是 {rows} 包装），统一用 result + cast
type Row = Record<string, unknown>;

export async function queryByAccount(filter: BoardFilter): Promise<Row[]> {
  const result = await db.execute(sql`
    SELECT
      a.id              AS account_id,
      a.account_name,
      a.placement_label,
      a.platform,
      SUM(p.cost_yuan)::numeric    AS cost,
      SUM(p.activations)            AS activations,
      SUM(p.payment_yuan)::numeric  AS payment,
      SUM(p.start_download)         AS start_download,
      SUM(p.finish_download)        AS finish_download
    FROM placement_row p
    JOIN live_account a ON a.id = p.live_account_id
    WHERE p.date BETWEEN ${filter.date_from} AND ${filter.date_to}
    ${datasetClause(filter.dataset_ids)}
    ${scopeClause(filter.scope)}
    ${filter.search ? sql`AND (a.account_name ILIKE ${"%" + filter.search + "%"} OR a.placement_label ILIKE ${"%" + filter.search + "%"})` : sql``}
    GROUP BY a.id, a.account_name, a.placement_label, a.platform
    ORDER BY cost DESC NULLS LAST
    LIMIT 200
  `);
  return result as unknown as Row[];
}

export async function queryByAnchor(filter: BoardFilter): Promise<Row[]> {
  const result = await db.execute(sql`
    SELECT
      p.attributed_dingtalk_user_id  AS user_id,
      du.name                         AS anchor_name,
      la.business_line                AS business_line,
      p.attribution_source            AS source,
      SUM(p.cost_yuan)::numeric       AS cost,
      SUM(p.activations)              AS activations,
      SUM(p.payment_yuan)::numeric    AS payment,
      COUNT(DISTINCT p.live_account_id) AS account_count
    FROM placement_row p
    LEFT JOIN dingtalk_user du ON du.user_id = p.attributed_dingtalk_user_id
    LEFT JOIN live_anchor la   ON la.dingtalk_user_id = p.attributed_dingtalk_user_id
    WHERE p.date BETWEEN ${filter.date_from} AND ${filter.date_to}
    ${datasetClause(filter.dataset_ids)}
    ${scopeClause(filter.scope)}
    GROUP BY p.attributed_dingtalk_user_id, du.name, la.business_line, p.attribution_source
    ORDER BY cost DESC NULLS LAST
    LIMIT 200
  `);
  return result as unknown as Row[];
}

export async function queryByHour(filter: BoardFilter): Promise<Row[]> {
  const result = await db.execute(sql`
    SELECT
      p.live_account_id  AS account_id,
      a.account_name,
      p.hour,
      SUM(p.cost_yuan)::numeric     AS cost,
      SUM(p.activations)             AS activations,
      SUM(p.payment_yuan)::numeric   AS payment
    FROM placement_row p
    JOIN live_account a ON a.id = p.live_account_id
    WHERE p.date BETWEEN ${filter.date_from} AND ${filter.date_to}
    ${datasetClause(filter.dataset_ids)}
    ${scopeClause(filter.scope)}
    GROUP BY p.live_account_id, a.account_name, p.hour
    ORDER BY a.account_name, p.hour
    LIMIT 5000
  `);
  return result as unknown as Row[];
}

// ─── NEW V2 QUERIES ──────────────────────────────────────────────────────────

export interface DatasetCount {
  dataset_id: string;
  count: number;
}

export async function queryDatasetCounts(filter: BoardFilter): Promise<DatasetCount[]> {
  const result = await db.execute(sql`
    SELECT dataset_id, COUNT(*)::int AS count
    FROM placement_row
    WHERE date BETWEEN ${filter.date_from} AND ${filter.date_to}
    GROUP BY dataset_id
    ORDER BY dataset_id
  `);
  return (result as unknown as { dataset_id: string; count: number }[]).map((r) => ({
    dataset_id: r.dataset_id,
    count: Number(r.count),
  }));
}

export interface DetailRow {
  date: string;
  hour: number;
  dataset_id: string;
  account_name: string;
  anchor_label: string | null;
  cost: number;
  activations: number;
  payment: number;
  attributed_dingtalk_user_id: string | null;
  attribution_source: string | null;
}

export async function queryDetail(filter: BoardFilter): Promise<DetailRow[]> {
  const anchorClause = filter.anchor_label
    ? sql`AND a.placement_label = ${filter.anchor_label}`
    : sql``;
  const result = await db.execute(sql`
    SELECT
      p.date,
      p.hour,
      p.dataset_id,
      a.account_name,
      a.placement_label AS anchor_label,
      p.cost_yuan::float        AS cost,
      p.activations,
      p.payment_yuan::float     AS payment,
      p.attributed_dingtalk_user_id,
      p.attribution_source
    FROM placement_row p
    JOIN live_account a ON a.id = p.live_account_id
    WHERE p.date BETWEEN ${filter.date_from} AND ${filter.date_to}
    ${datasetClause(filter.dataset_ids)}
    ${scopeClause(filter.scope)}
    ${anchorClause}
    ORDER BY p.date DESC, p.hour DESC, a.placement_label
    LIMIT 500
  `);
  return (result as unknown as DetailRow[]).map((r) => ({
    ...r,
    cost: Number(r.cost),
    activations: Number(r.activations),
    payment: Number(r.payment),
  }));
}

export interface SummaryRow {
  anchor_label: string | null;
  row_count: number;
  cost: number;
  activations: number;
  payment: number;
  start_download: number;
  finish_download: number;
}

export async function querySummary(filter: BoardFilter): Promise<SummaryRow[]> {
  const result = await db.execute(sql`
    SELECT
      a.placement_label,
      COUNT(*)::int                         AS row_count,
      SUM(p.cost_yuan)::float               AS cost,
      SUM(p.activations)::int               AS activations,
      SUM(p.payment_yuan)::float            AS payment,
      SUM(p.start_download)::int            AS start_download,
      SUM(p.finish_download)::int           AS finish_download
    FROM placement_row p
    JOIN live_account a ON a.id = p.live_account_id
    WHERE p.date BETWEEN ${filter.date_from} AND ${filter.date_to}
    ${datasetClause(filter.dataset_ids)}
    ${scopeClause(filter.scope)}
    GROUP BY a.placement_label
    ORDER BY cost DESC NULLS LAST
    LIMIT 100
  `);
  return (
    result as unknown as {
      placement_label: string | null;
      row_count: number;
      cost: number;
      activations: number;
      payment: number;
      start_download: number;
      finish_download: number;
    }[]
  ).map((r) => ({
    anchor_label: r.placement_label,
    row_count: Number(r.row_count),
    cost: Number(r.cost),
    activations: Number(r.activations),
    payment: Number(r.payment),
    start_download: Number(r.start_download),
    finish_download: Number(r.finish_download),
  }));
}

export interface ScheduleRow {
  date: string;
  time_slot: [string, string];
  account_id: string;
  account_name: string;
  placement_label: string | null;
  anchor_user_id: string;
  anchor_name: string | null;
  total_cost: number;
  personal_cost: number;
  total_acts: number;
  personal_acts: number;
  total_unit_price: number | null;
  personal_unit_price: number | null;
  total_payment: number;
  personal_payment: number;
}

/**
 * 按"开播记录"归因（live_session_log）算同样的 ScheduleRow 结构。
 *
 * 跟 querySchedule 的差别：
 *   querySchedule         → 按主播默认排班 + override + daily_segment 归因
 *   queryAnchorCheckin    → 按主播扫码开播打卡（live_session_log）的实际时段归因
 *
 * 每个 in_progress / ended session = 一行 ScheduleRow。
 * personal_cost = total_cost = SUM(placement_row.cost) WHERE 该小时中点 ∈ session [start_at, end_at]
 * （同账号同时刻只允许一个 in_progress，所以每小时唯一归属一个主播）
 *
 * 跨日 session 暂只算到 start_at 那天（next-day 部分先忽略；MVP 简化）。
 */
export async function queryAnchorCheckin(
  filter: BoardFilter,
  anchorLabel: string,
): Promise<ScheduleRow[]> {
  const result = await db.execute(sql`
    WITH sess AS (
      SELECT
        l.id,
        l.live_account_id AS account_id,
        l.anchor_dingtalk_user_id,
        l.start_at,
        COALESCE(l.end_at, now()) AS end_at,
        a.account_name,
        a.placement_label,
        du.name AS anchor_name
      FROM live_session_log l
      JOIN live_account a ON a.id = l.live_account_id
      LEFT JOIN dingtalk_user du ON du.user_id = l.anchor_dingtalk_user_id
      WHERE a.placement_label = ${anchorLabel}
        AND l.start_at::date >= ${filter.date_from}::date
        AND l.start_at::date <= ${filter.date_to}::date
    ),
    agg AS (
      SELECT
        s.id AS sid,
        SUM(p.cost_yuan)::float       AS personal_cost,
        SUM(p.activations)::int       AS personal_acts,
        SUM(p.payment_yuan)::float    AS personal_payment
      FROM sess s
      LEFT JOIN placement_row p
        ON p.live_account_id = s.account_id
       -- p.date/p.hour 是北京日历值，DB 跑 UTC：必须 AT TIME ZONE 'Asia/Shanghai' 按北京墙钟
       -- 解释成真实时刻再与 start_at/end_at（timestamptz）比较，否则错位 8 小时
       AND ((p.date::timestamp + interval '1 hour' * p.hour + interval '30 minutes') AT TIME ZONE 'Asia/Shanghai') >= s.start_at
       AND ((p.date::timestamp + interval '1 hour' * p.hour + interval '30 minutes') AT TIME ZONE 'Asia/Shanghai') < s.end_at
        ${datasetClause(filter.dataset_ids)}
      GROUP BY s.id
    )
    SELECT
      s.start_at::date::text                AS date,
      to_char(s.start_at, 'HH24:MI')        AS slot_start,
      to_char(s.end_at, 'HH24:MI')          AS slot_end,
      s.account_id::text                    AS account_id,
      s.account_name,
      s.placement_label,
      s.anchor_dingtalk_user_id::text       AS anchor_user_id,
      s.anchor_name,
      COALESCE(agg.personal_cost, 0)::float    AS personal_cost,
      COALESCE(agg.personal_acts, 0)::int      AS personal_acts,
      COALESCE(agg.personal_payment, 0)::float AS personal_payment
    FROM sess s
    LEFT JOIN agg ON agg.sid = s.id
    ORDER BY s.start_at DESC
  `);

  interface Raw {
    date: string;
    slot_start: string;
    slot_end: string;
    account_id: string;
    account_name: string;
    placement_label: string | null;
    anchor_user_id: string;
    anchor_name: string | null;
    personal_cost: number;
    personal_acts: number;
    personal_payment: number;
  }
  return (result as unknown as Raw[]).map((r) => {
    const cost = Number(r.personal_cost);
    const acts = Number(r.personal_acts);
    const payment = Number(r.personal_payment);
    return {
      date: r.date,
      time_slot: [r.slot_start, r.slot_end] as [string, string],
      account_id: r.account_id,
      account_name: r.account_name,
      placement_label: r.placement_label,
      anchor_user_id: r.anchor_user_id,
      anchor_name: r.anchor_name,
      // 开播归因下整段都归一个主播，total ≡ personal
      total_cost: cost,
      personal_cost: cost,
      total_acts: acts,
      personal_acts: acts,
      total_unit_price: acts > 0 ? cost / acts : null,
      personal_unit_price: acts > 0 ? cost / acts : null,
      total_payment: payment,
      personal_payment: payment,
    };
  });
}

export interface CheckinSlot {
  anchorName: string | null;
  slotStart: string; // "HH:MM"
  slotEnd: string;
  cost: number;
  acts: number;
}

/**
 * 批量：每个投放包(placement_label)在筛选范围内的开播主播时段 + 分得消耗。
 * 卡片视图右栏用——逻辑同 queryAnchorCheckin，但不限定单个主播，一次查全部账号。
 */
export async function queryCheckinByAccount(
  filter: BoardFilter,
): Promise<Record<string, CheckinSlot[]>> {
  const result = await db.execute(sql`
    WITH sess AS (
      SELECT
        l.id,
        l.live_account_id AS account_id,
        l.start_at,
        COALESCE(l.end_at, now()) AS end_at,
        a.placement_label,
        du.name AS anchor_name
      FROM live_session_log l
      JOIN live_account a ON a.id = l.live_account_id
      LEFT JOIN dingtalk_user du ON du.user_id = l.anchor_dingtalk_user_id
      WHERE a.placement_label IS NOT NULL
        AND l.start_at::date >= ${filter.date_from}::date
        AND l.start_at::date <= ${filter.date_to}::date
    ),
    agg AS (
      SELECT
        s.id AS sid,
        SUM(p.cost_yuan)::float    AS cost,
        SUM(p.activations)::int    AS acts
      FROM sess s
      LEFT JOIN placement_row p
        ON p.live_account_id = s.account_id
       -- p.date/p.hour 是北京日历值，DB 跑 UTC：必须 AT TIME ZONE 'Asia/Shanghai' 按北京墙钟
       -- 解释成真实时刻再与 start_at/end_at（timestamptz）比较，否则错位 8 小时
       AND ((p.date::timestamp + interval '1 hour' * p.hour + interval '30 minutes') AT TIME ZONE 'Asia/Shanghai') >= s.start_at
       AND ((p.date::timestamp + interval '1 hour' * p.hour + interval '30 minutes') AT TIME ZONE 'Asia/Shanghai') < s.end_at
        ${datasetClause(filter.dataset_ids)}
      GROUP BY s.id
    )
    SELECT
      s.placement_label,
      to_char(s.start_at, 'HH24:MI')  AS slot_start,
      to_char(s.end_at, 'HH24:MI')    AS slot_end,
      s.anchor_name,
      COALESCE(agg.cost, 0)::float    AS cost,
      COALESCE(agg.acts, 0)::int      AS acts
    FROM sess s
    LEFT JOIN agg ON agg.sid = s.id
    ORDER BY s.placement_label, s.start_at
  `);

  const raw = result as unknown as {
    placement_label: string;
    slot_start: string;
    slot_end: string;
    anchor_name: string | null;
    cost: number;
    acts: number;
  }[];

  const byLabel: Record<string, CheckinSlot[]> = {};
  for (const r of raw) {
    const arr = byLabel[r.placement_label] ?? (byLabel[r.placement_label] = []);
    arr.push({
      anchorName: r.anchor_name,
      slotStart: r.slot_start,
      slotEnd: r.slot_end,
      cost: Number(r.cost),
      acts: Number(r.acts),
    });
  }
  return byLabel;
}

export interface TrendPoint {
  anchor: string;
  date: string;
  hour: number;
  cost: number;
  acts: number;
  payment: number;
}

export async function queryTrend(filter: BoardFilter): Promise<TrendPoint[]> {
  const result = await db.execute(sql`
    SELECT
      COALESCE(a.placement_label, a.account_name) AS anchor,
      p.date,
      p.hour,
      SUM(p.cost_yuan)::float     AS cost,
      SUM(p.activations)::int     AS acts,
      SUM(p.payment_yuan)::float  AS payment
    FROM placement_row p
    JOIN live_account a ON a.id = p.live_account_id
    WHERE p.date BETWEEN ${filter.date_from} AND ${filter.date_to}
    ${datasetClause(filter.dataset_ids)}
    ${scopeClause(filter.scope)}
    GROUP BY 1, 2, 3
    ORDER BY 2, 3
  `);
  return (result as unknown as TrendPoint[]).map((r) => ({
    ...r,
    cost: Number(r.cost),
    acts: Number(r.acts),
    payment: Number(r.payment),
    hour: Number(r.hour),
  }));
}

export interface KpiSummary {
  cost: number;
  activations: number;
  payment: number;
  roi: number; // payment / cost
  cpa: number; // cost / activations
  prev: {
    cost: number;
    activations: number;
    payment: number;
    roi: number;
    cpa: number;
  };
  daily: { date: string; cost: number; activations: number; payment: number }[];
}

export async function queryKpiSummary(filter: BoardFilter): Promise<KpiSummary> {
  // 当期总计
  const cur = (await db.execute(sql`
    SELECT
      COALESCE(SUM(p.cost_yuan), 0)::float    AS cost,
      COALESCE(SUM(p.activations), 0)::int    AS activations,
      COALESCE(SUM(p.payment_yuan), 0)::float AS payment
    FROM placement_row p
    JOIN live_account a ON a.id = p.live_account_id
    WHERE p.date BETWEEN ${filter.date_from} AND ${filter.date_to}
    ${datasetClause(filter.dataset_ids)}
    ${scopeClause(filter.scope)}
  `)) as unknown as { cost: number; activations: number; payment: number }[];

  // 前期同样长度对比
  const fromD = new Date(filter.date_from + "T00:00:00Z");
  const toD = new Date(filter.date_to + "T00:00:00Z");
  const days = Math.max(1, Math.round((toD.getTime() - fromD.getTime()) / 86400000) + 1);
  const prevTo = new Date(fromD);
  prevTo.setUTCDate(prevTo.getUTCDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setUTCDate(prevFrom.getUTCDate() - days + 1);
  const prevFromStr = prevFrom.toISOString().slice(0, 10);
  const prevToStr = prevTo.toISOString().slice(0, 10);

  const prev = (await db.execute(sql`
    SELECT
      COALESCE(SUM(p.cost_yuan), 0)::float    AS cost,
      COALESCE(SUM(p.activations), 0)::int    AS activations,
      COALESCE(SUM(p.payment_yuan), 0)::float AS payment
    FROM placement_row p
    JOIN live_account a ON a.id = p.live_account_id
    WHERE p.date BETWEEN ${prevFromStr} AND ${prevToStr}
    ${datasetClause(filter.dataset_ids)}
    ${scopeClause(filter.scope)}
  `)) as unknown as { cost: number; activations: number; payment: number }[];

  // 当期按日 sparkline
  const daily = (await db.execute(sql`
    SELECT
      p.date::text                            AS date,
      COALESCE(SUM(p.cost_yuan), 0)::float    AS cost,
      COALESCE(SUM(p.activations), 0)::int    AS activations,
      COALESCE(SUM(p.payment_yuan), 0)::float AS payment
    FROM placement_row p
    JOIN live_account a ON a.id = p.live_account_id
    WHERE p.date BETWEEN ${filter.date_from} AND ${filter.date_to}
    ${datasetClause(filter.dataset_ids)}
    ${scopeClause(filter.scope)}
    GROUP BY p.date
    ORDER BY p.date
  `)) as unknown as { date: string; cost: number; activations: number; payment: number }[];

  const c = cur.at(0) ?? { cost: 0, activations: 0, payment: 0 };
  const p = prev.at(0) ?? { cost: 0, activations: 0, payment: 0 };
  const cCost = Number(c.cost),
    cAct = Number(c.activations),
    cPay = Number(c.payment);
  const pCost = Number(p.cost),
    pAct = Number(p.activations),
    pPay = Number(p.payment);

  return {
    cost: cCost,
    activations: cAct,
    payment: cPay,
    roi: cCost > 0 ? cPay / cCost : 0,
    cpa: cAct > 0 ? cCost / cAct : 0,
    prev: {
      cost: pCost,
      activations: pAct,
      payment: pPay,
      roi: pCost > 0 ? pPay / pCost : 0,
      cpa: pAct > 0 ? pCost / pAct : 0,
    },
    daily: daily.map((d) => ({
      date: d.date,
      cost: Number(d.cost),
      activations: Number(d.activations),
      payment: Number(d.payment),
    })),
  };
}

// SummaryRow + sparkline 数据（按日 cost）
export interface SummaryRowExt extends SummaryRow {
  sparkline: number[]; // 当期每日 cost
  account_count: number;
  platforms: string[]; // 该 anchor_label 下涉及的平台
  prev_cost: number; // 前期同长度的 cost（用于同比）
  // 来自 live_account 的展示字段（placement_label unique，直接 join）
  account_name: string | null;
  platform_account_id: string | null;
  avatar: string | null;
}

export async function querySummaryExt(filter: BoardFilter): Promise<SummaryRowExt[]> {
  // 1. 主表（placement_label 是 unique，直接取代表 live_account 字段）
  const main = (await db.execute(sql`
    SELECT
      a.placement_label,
      MAX(a.account_name)            AS account_name,
      MAX(a.platform_account_id)     AS platform_account_id,
      MAX(a.avatar)                  AS avatar,
      COUNT(*)::int                             AS row_count,
      COUNT(DISTINCT a.id)::int                 AS account_count,
      ARRAY_AGG(DISTINCT a.platform) FILTER (WHERE a.platform IS NOT NULL) AS platforms,
      SUM(p.cost_yuan)::float                   AS cost,
      SUM(p.activations)::int                   AS activations,
      SUM(p.payment_yuan)::float                AS payment,
      SUM(p.start_download)::int                AS start_download,
      SUM(p.finish_download)::int               AS finish_download
    FROM placement_row p
    JOIN live_account a ON a.id = p.live_account_id
    WHERE p.date BETWEEN ${filter.date_from} AND ${filter.date_to}
    ${datasetClause(filter.dataset_ids)}
    ${scopeClause(filter.scope)}
    ${filter.anchor_label ? sql`AND a.placement_label = ${filter.anchor_label}` : sql``}
    ${filter.search ? sql`AND (a.account_name ILIKE ${"%" + filter.search + "%"} OR a.placement_label ILIKE ${"%" + filter.search + "%"})` : sql``}
    GROUP BY a.placement_label
    ORDER BY cost DESC NULLS LAST
    LIMIT 100
  `)) as unknown as {
    placement_label: string | null;
    account_name: string | null;
    platform_account_id: string | null;
    avatar: string | null;
    row_count: number;
    account_count: number;
    platforms: string[] | null;
    cost: number;
    activations: number;
    payment: number;
    start_download: number;
    finish_download: number;
  }[];

  if (main.length === 0) return [];

  // 2. sparkline (按 placement_label + date 聚合)
  const spark = (await db.execute(sql`
    SELECT
      a.placement_label,
      p.date::text          AS date,
      SUM(p.cost_yuan)::float AS cost
    FROM placement_row p
    JOIN live_account a ON a.id = p.live_account_id
    WHERE p.date BETWEEN ${filter.date_from} AND ${filter.date_to}
    ${datasetClause(filter.dataset_ids)}
    ${scopeClause(filter.scope)}
    ${filter.anchor_label ? sql`AND a.placement_label = ${filter.anchor_label}` : sql``}
    ${filter.search ? sql`AND (a.account_name ILIKE ${"%" + filter.search + "%"} OR a.placement_label ILIKE ${"%" + filter.search + "%"})` : sql``}
    GROUP BY a.placement_label, p.date
    ORDER BY p.date
  `)) as unknown as { placement_label: string | null; date: string; cost: number }[];

  // 3. 前期同长度 cost（同比）
  const fromD = new Date(filter.date_from + "T00:00:00Z");
  const toD = new Date(filter.date_to + "T00:00:00Z");
  const days = Math.max(1, Math.round((toD.getTime() - fromD.getTime()) / 86400000) + 1);
  const prevTo = new Date(fromD);
  prevTo.setUTCDate(prevTo.getUTCDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setUTCDate(prevFrom.getUTCDate() - days + 1);

  const prev = (await db.execute(sql`
    SELECT
      a.placement_label,
      SUM(p.cost_yuan)::float AS cost
    FROM placement_row p
    JOIN live_account a ON a.id = p.live_account_id
    WHERE p.date BETWEEN ${prevFrom.toISOString().slice(0, 10)} AND ${prevTo.toISOString().slice(0, 10)}
    ${datasetClause(filter.dataset_ids)}
    ${scopeClause(filter.scope)}
    ${filter.anchor_label ? sql`AND a.placement_label = ${filter.anchor_label}` : sql``}
    ${filter.search ? sql`AND (a.account_name ILIKE ${"%" + filter.search + "%"} OR a.placement_label ILIKE ${"%" + filter.search + "%"})` : sql``}
    GROUP BY a.placement_label
  `)) as unknown as { placement_label: string | null; cost: number }[];

  const prevByLabel = new Map<string | null, number>();
  for (const r of prev) prevByLabel.set(r.placement_label, Number(r.cost));

  // 拼出按 label 分组的日维 cost
  const sparkByLabel = new Map<string | null, Map<string, number>>();
  for (const s of spark) {
    let m = sparkByLabel.get(s.placement_label);
    if (!m) {
      m = new Map();
      sparkByLabel.set(s.placement_label, m);
    }
    m.set(s.date, Number(s.cost));
  }

  // 当期日期序列
  const dates: string[] = [];
  for (let d = new Date(fromD); d <= toD; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }

  return main.map((r) => {
    const m = sparkByLabel.get(r.placement_label) ?? new Map<string, number>();
    return {
      anchor_label: r.placement_label,
      row_count: Number(r.row_count),
      cost: Number(r.cost),
      activations: Number(r.activations),
      payment: Number(r.payment),
      start_download: Number(r.start_download),
      finish_download: Number(r.finish_download),
      sparkline: dates.map((d) => m.get(d) ?? 0),
      account_count: Number(r.account_count),
      platforms: (r.platforms ?? []).filter(Boolean),
      prev_cost: prevByLabel.get(r.placement_label) ?? 0,
      account_name: r.account_name,
      platform_account_id: r.platform_account_id,
      avatar: r.avatar,
    };
  });
}

// 主播 → 投放包子列表（用于 summary 行展开）
export interface SubAccountRow {
  placement_label: string | null;
  account_id: string;
  account_name: string;
  platform: string | null;
  cost: number;
  activations: number;
  payment: number;
}

export async function querySubAccountsAll(filter: BoardFilter): Promise<SubAccountRow[]> {
  const result = (await db.execute(sql`
    SELECT
      a.placement_label,
      a.id                              AS account_id,
      a.account_name,
      a.platform,
      SUM(p.cost_yuan)::float           AS cost,
      SUM(p.activations)::int           AS activations,
      SUM(p.payment_yuan)::float        AS payment
    FROM placement_row p
    JOIN live_account a ON a.id = p.live_account_id
    WHERE p.date BETWEEN ${filter.date_from} AND ${filter.date_to}
    ${datasetClause(filter.dataset_ids)}
    ${scopeClause(filter.scope)}
    GROUP BY a.placement_label, a.id, a.account_name, a.platform
    ORDER BY a.placement_label, cost DESC NULLS LAST
  `)) as unknown as SubAccountRow[];
  return result.map((r) => ({
    ...r,
    cost: Number(r.cost),
    activations: Number(r.activations),
    payment: Number(r.payment),
  }));
}

// 单个投放账号在 filter 范围内的按 (日期 × 小时) 数据 — 用于二级展开热力图
export interface AccountHourlyRow {
  date: string;
  hour: number;
  /**
   * 同一日内上一行的 hour。第一行 null。
   * UI 渲染区间用：start = prev_hour == null ? 0 : prev_hour + 1, end = hour + 1
   * 比如：[null, 10] → 0:00-11:00（首次上传含 0 点开始到 11 点的累计）
   *      [10, 15] → 11:00-16:00（中间漏传，5 小时累计算到 15 这行）
   */
  prev_hour: number | null;
  cost: number;
  activations: number;
  payment: number;
}

export async function queryAccountHourly(
  filter: BoardFilter,
  accountId: string,
): Promise<AccountHourlyRow[]> {
  const result = (await db.execute(sql`
    WITH agg AS (
      SELECT
        p.date::text                    AS date,
        p.hour                          AS hour,
        SUM(p.cost_yuan)::float         AS cost,
        SUM(p.activations)::int         AS activations,
        SUM(p.payment_yuan)::float      AS payment
      FROM placement_row p
      WHERE p.live_account_id = ${accountId}
        AND p.date BETWEEN ${filter.date_from} AND ${filter.date_to}
      ${datasetClause(filter.dataset_ids)}
      ${scopeClause(filter.scope)}
      GROUP BY p.date, p.hour
    )
    SELECT
      date, hour, cost, activations, payment,
      LAG(hour) OVER (PARTITION BY date ORDER BY hour) AS prev_hour
    FROM agg
    ORDER BY date DESC, hour ASC
  `)) as unknown as (AccountHourlyRow & { prev_hour: number | null })[];
  return result.map((r) => ({
    date: r.date,
    hour: Number(r.hour),
    prev_hour: r.prev_hour == null ? null : Number(r.prev_hour),
    cost: Number(r.cost),
    activations: Number(r.activations),
    payment: Number(r.payment),
  }));
}

export interface AnchorLabelOption {
  label: string; // placement_label，用于过滤
  account_name: string | null; // 代表 account_name，用于展示
}

export interface PlacementAccountOption {
  account_id: string;
  account_name: string;
  placement_label: string | null;
}

/** 时段查询的直播账号选项；权限仍按投放归因主播范围约束。 */
export async function queryPlacementAccounts(
  filter: BoardFilter,
): Promise<PlacementAccountOption[]> {
  const result = await db.execute(sql`
    SELECT
      a.id AS account_id,
      a.account_name,
      a.placement_label
    FROM placement_row p
    JOIN live_account a ON a.id = p.live_account_id
    WHERE p.date BETWEEN ${filter.date_from}::date AND (${filter.date_to}::date + 1)
    ${datasetClause(filter.dataset_ids)}
    ${scopeClause(filter.scope)}
    GROUP BY a.id, a.account_name, a.placement_label
    ORDER BY a.account_name
  `);
  return result as unknown as PlacementAccountOption[];
}

export interface PlacementTimeRangeRow {
  /** 所属查询日；跨夜后的凌晨数据仍归到前一天的窗口。 */
  window_date: string;
  date: string;
  hour: number;
  anchor_user_id: string;
  anchor_name: string;
  account_name: string;
  placement_label: string | null;
  cost: number;
  activations: number;
  payment: number;
}

export interface PlacementTimeRangeResult {
  rows: PlacementTimeRangeRow[];
  total: number;
  page: number;
  page_size: number;
  summary: {
    cost: number;
    activations: number;
    payment: number;
  };
}

const TIME_RANGE_PAGE_SIZE = 100;

/**
 * 按「基准日期 × 每日小时窗口 × 开播记录主播」查看小时投放。
 * 例：from=to=08-01, 15→09 会取 08-01 15:00 至 08-02 09:00（左闭右开）。
 */
export async function queryPlacementTimeRange(
  filter: BoardFilter & TimeRangeSelection,
  options: { pageSize?: number } = {},
): Promise<PlacementTimeRangeResult> {
  const pageSize = Math.max(1, Math.min(options.pageSize ?? TIME_RANGE_PAGE_SIZE, 1_000_000));
  const crossesMidnight = filter.end_hour < filter.start_hour;
  const isFullDay = filter.end_hour === filter.start_hour;
  const timeClause = isFullDay
    ? sql`p.date BETWEEN ${filter.date_from}::date AND ${filter.date_to}::date`
    : crossesMidnight
      ? sql`(
          (p.date BETWEEN ${filter.date_from}::date AND ${filter.date_to}::date AND p.hour >= ${filter.start_hour})
          OR
          (p.date BETWEEN (${filter.date_from}::date + 1) AND (${filter.date_to}::date + 1) AND p.hour < ${filter.end_hour})
        )`
      : sql`p.date BETWEEN ${filter.date_from}::date AND ${filter.date_to}::date
          AND p.hour >= ${filter.start_hour} AND p.hour < ${filter.end_hour}`;
  const windowDate = crossesMidnight
    ? sql`CASE WHEN p.hour < ${filter.end_hour} THEN (p.date - 1)::text ELSE p.date::text END`
    : sql`p.date::text`;
  const accountClause = filter.account_id
    ? sql`AND p.live_account_id = ${filter.account_id}`
    : sql``;

  const summaryResult = (await db.execute(sql`
    WITH grouped AS (
      SELECT
        p.date,
        p.hour,
        l.anchor_dingtalk_user_id,
        a.id AS account_id,
        SUM(p.cost_yuan)::float AS cost,
        SUM(p.activations)::int AS activations,
        SUM(p.payment_yuan)::float AS payment
      FROM placement_row p
      JOIN live_account a ON a.id = p.live_account_id
      JOIN live_session_log l
        ON l.live_account_id = p.live_account_id
       AND ((p.date::timestamp + interval '1 hour' * p.hour + interval '30 minutes') AT TIME ZONE 'Asia/Shanghai') >= l.start_at
       AND ((p.date::timestamp + interval '1 hour' * p.hour + interval '30 minutes') AT TIME ZONE 'Asia/Shanghai') < COALESCE(l.end_at, now())
      WHERE ${timeClause}
      ${datasetClause(filter.dataset_ids)}
      ${scopeClause(filter.scope)}
      ${accountClause}
      GROUP BY p.date, p.hour, l.anchor_dingtalk_user_id, a.id
    )
    SELECT
      COUNT(*)::int AS total,
      COALESCE(SUM(cost), 0)::float AS cost,
      COALESCE(SUM(activations), 0)::int AS activations,
      COALESCE(SUM(payment), 0)::float AS payment
    FROM grouped
  `)) as unknown as { total: number; cost: number; activations: number; payment: number }[];

  const summary = summaryResult[0] ?? { total: 0, cost: 0, activations: 0, payment: 0 };
  const total = Number(summary.total);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(filter.page, totalPages);
  const offset = (page - 1) * pageSize;

  const result = await db.execute(sql`
      SELECT
        ${windowDate} AS window_date,
        p.date::text AS date,
        p.hour,
        l.anchor_dingtalk_user_id AS anchor_user_id,
        COALESCE(du.name, l.anchor_dingtalk_user_id) AS anchor_name,
        a.account_name,
        a.placement_label,
        SUM(p.cost_yuan)::float AS cost,
        SUM(p.activations)::int AS activations,
        SUM(p.payment_yuan)::float AS payment
      FROM placement_row p
      JOIN live_account a ON a.id = p.live_account_id
      JOIN live_session_log l
        ON l.live_account_id = p.live_account_id
       AND ((p.date::timestamp + interval '1 hour' * p.hour + interval '30 minutes') AT TIME ZONE 'Asia/Shanghai') >= l.start_at
       AND ((p.date::timestamp + interval '1 hour' * p.hour + interval '30 minutes') AT TIME ZONE 'Asia/Shanghai') < COALESCE(l.end_at, now())
      LEFT JOIN dingtalk_user du ON du.user_id = l.anchor_dingtalk_user_id
      WHERE ${timeClause}
      ${datasetClause(filter.dataset_ids)}
      ${scopeClause(filter.scope)}
      ${accountClause}
      GROUP BY window_date, p.date, p.hour, l.anchor_dingtalk_user_id, du.name,
        a.id, a.account_name, a.placement_label
      ORDER BY window_date DESC, p.date, p.hour, a.account_name
      LIMIT ${pageSize}
      OFFSET ${offset}
    `);

  const rows = (result as unknown as PlacementTimeRangeRow[]).map((row) => ({
    ...row,
    hour: Number(row.hour),
    cost: Number(row.cost),
    activations: Number(row.activations),
    payment: Number(row.payment),
  }));
  return {
    rows,
    total,
    page,
    page_size: pageSize,
    summary: {
      cost: Number(summary.cost),
      activations: Number(summary.activations),
      payment: Number(summary.payment),
    },
  };
}

export async function queryAnchorLabels(filter: BoardFilter): Promise<AnchorLabelOption[]> {
  const result = await db.execute(sql`
    SELECT
      a.placement_label                 AS label,
      MAX(a.account_name)               AS account_name
    FROM placement_row p
    JOIN live_account a ON a.id = p.live_account_id
    WHERE p.date BETWEEN ${filter.date_from} AND ${filter.date_to}
    ${datasetClause(filter.dataset_ids)}
    ${scopeClause(filter.scope)}
      AND a.placement_label IS NOT NULL
    GROUP BY a.placement_label
    ORDER BY a.placement_label
  `);
  return (result as unknown as { label: string; account_name: string | null }[]).map((r) => ({
    label: r.label,
    account_name: r.account_name,
  }));
}

export interface ScheduleYesterdayKpi {
  cost: number;
  acts: number;
  payment: number;
}

/** 昨日按 (account, hour) 维度的小时级累计，client 可按班次 [start, end) 任意求和。 */
export interface ScheduleYesterdayHourly {
  byAccount: Record<string, Record<number, ScheduleYesterdayKpi>>;
  cutoffHour: number; // 用于 account 级 KPI 同比；当 filter.date_to >= 今天时 = 当前 Shanghai 小时，否则 24
}
