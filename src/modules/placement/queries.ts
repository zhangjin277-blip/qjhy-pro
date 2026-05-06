import "server-only";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";
import { mergeWithOverride } from "@/modules/schedule-override";

export interface BoardFilter {
  date_from: string; // ISO
  date_to: string; // ISO
  dataset_ids?: string[]; // 默认全部
  search?: string; // 账号名 / 主播名 模糊
  anchor_label?: string; // placement_label 精确筛选（detail 视图）
  view?: "detail" | "summary" | "schedule"; // 当前视图模式
}

function datasetClause(ds?: string[]) {
  if (!ds || ds.length === 0) return sql``;
  return sql`AND p.dataset_id IN (${sql.join(
    ds.map((d) => sql`${d}`),
    sql`, `,
  )})`;
}

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

export async function querySchedule(filter: BoardFilter): Promise<ScheduleRow[]> {
  // 1. Fetch default schedules active in date range
  const schedules = await db.execute(sql`
    SELECT
      d.id,
      d.account_id,
      d.dingtalk_user_id,
      d.time_slots,
      d.rest_days,
      a.account_name,
      a.placement_label,
      du.name AS anchor_name
    FROM account_anchor_default d
    JOIN live_account a ON a.id = d.account_id
    LEFT JOIN dingtalk_user du ON du.user_id = d.dingtalk_user_id
    WHERE (d.effective_from IS NULL OR d.effective_from <= ${filter.date_to})
      AND (d.effective_to IS NULL OR d.effective_to >= ${filter.date_from})
  `);

  interface RawSchedule {
    id: string;
    account_id: string;
    dingtalk_user_id: string;
    time_slots: [string, string][];
    rest_days: number[];
    account_name: string;
    placement_label: string | null;
    anchor_name: string | null;
  }
  const scheduleList = schedules as unknown as RawSchedule[];
  if (scheduleList.length === 0) return [];

  // 2. Collect all account_ids involved in default schedules
  const involvedAccountIds = [...new Set(scheduleList.map((s) => s.account_id))];

  // 3. Fetch schedule_override rows for the date range + involved accounts
  const overrideRows = await db.execute(sql`
    SELECT
      o.account_id,
      o.date::text AS date,
      o.dingtalk_user_id,
      o.time_slots,
      du.name AS anchor_name
    FROM schedule_override o
    LEFT JOIN dingtalk_user du ON du.user_id = o.dingtalk_user_id
    WHERE o.date BETWEEN ${filter.date_from} AND ${filter.date_to}
      AND o.account_id IN (${sql.join(
        involvedAccountIds.map((id) => sql`${id}`),
        sql`, `,
      )})
  `);

  interface RawOverride {
    account_id: string;
    date: string;
    dingtalk_user_id: string;
    time_slots: [string, string][];
    anchor_name: string | null;
  }
  const overrideList = overrideRows as unknown as RawOverride[];

  // 4. Index overrides by (account_id, date) for fast lookup
  //    Map key: `${account_id}::${date}`
  const overrideMap = new Map<string, RawOverride[]>();
  for (const ov of overrideList) {
    const key = `${ov.account_id}::${ov.date}`;
    const existing = overrideMap.get(key);
    if (existing) {
      existing.push(ov);
    } else {
      overrideMap.set(key, [ov]);
    }
  }

  // 5. Build per-(account_id) lookup: account metadata from default schedules
  const accountMeta = new Map<string, { account_name: string; placement_label: string | null }>();
  for (const s of scheduleList) {
    if (!accountMeta.has(s.account_id)) {
      accountMeta.set(s.account_id, {
        account_name: s.account_name,
        placement_label: s.placement_label,
      });
    }
  }

  // 6. Build a lookup for anchor_name by dingtalk_user_id (from defaults + overrides)
  const anchorNames = new Map<string, string | null>();
  for (const s of scheduleList) {
    anchorNames.set(s.dingtalk_user_id, s.anchor_name);
  }
  for (const ov of overrideList) {
    if (!anchorNames.has(ov.dingtalk_user_id)) {
      anchorNames.set(ov.dingtalk_user_id, ov.anchor_name);
    }
  }

  // 7. Fetch all placement rows in date range
  const placements = await db.execute(sql`
    SELECT
      p.date, p.hour,
      p.live_account_id AS account_id,
      p.cost_yuan::float        AS cost,
      p.activations::int        AS activations,
      p.payment_yuan::float     AS payment,
      p.attributed_dingtalk_user_id
    FROM placement_row p
    WHERE p.date BETWEEN ${filter.date_from} AND ${filter.date_to}
    ${datasetClause(filter.dataset_ids)}
  `);

  interface RawPlacement {
    date: string;
    hour: number;
    account_id: string;
    cost: number;
    activations: number;
    payment: number;
    attributed_dingtalk_user_id: string | null;
  }
  const placementList = (placements as unknown as RawPlacement[]).map((p) => ({
    ...p,
    cost: Number(p.cost),
    activations: Number(p.activations),
    payment: Number(p.payment),
    hour: Number(p.hour),
  }));

  // 8. Generate all dates in range
  const dates: string[] = [];
  const fromD = new Date(filter.date_from);
  const toD = new Date(filter.date_to);
  for (let d = new Date(fromD); d <= toD; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }

  // 9. Group default schedules by account_id for mergeWithOverride
  //    defaultsByAccount[account_id] = DefaultSchedule[]
  const defaultsByAccount = new Map<
    string,
    { user: string; slots: [string, string][]; rest_days: number[] }[]
  >();
  for (const s of scheduleList) {
    const arr = defaultsByAccount.get(s.account_id) ?? [];
    arr.push({
      user: s.dingtalk_user_id,
      slots: s.time_slots ?? [],
      rest_days: s.rest_days ?? [],
    });
    defaultsByAccount.set(s.account_id, arr);
  }

  // 10. Build result rows using effective (merged) schedules per (account_id, date)
  const rows: ScheduleRow[] = [];

  for (const accountId of involvedAccountIds) {
    const meta = accountMeta.get(accountId);
    if (!meta) continue;
    const defaults = defaultsByAccount.get(accountId) ?? [];

    for (const date of dates) {
      const key = `${accountId}::${date}`;
      const dayOverrides = overrideMap.get(key) ?? [];

      // Convert override rows to OverrideSchedule[]
      const overrideSchedules = dayOverrides.map((ov) => ({
        user: ov.dingtalk_user_id,
        slots: ov.time_slots ?? [],
      }));

      // Merge: override wins per user; slots=[] means day-off (休假)
      const effective = mergeWithOverride(defaults, overrideSchedules);

      for (const eff of effective) {
        // slots=[] means this user is on leave for this date — skip entirely
        if (eff.slots.length === 0) continue;

        // Check rest_days from effective schedule (always from default)
        const dow = new Date(date + "T12:00:00Z").getUTCDay(); // 0=Sun..6=Sat
        const isoWeekday = dow === 0 ? 7 : dow;
        // For override-sourced entries that have no default rest_days, rest_days=[]
        if (eff.rest_days.includes(isoWeekday)) continue;

        for (const slot of eff.slots) {
          const [slotStart, slotEnd] = slot;
          const startHour = parseInt((slotStart ?? "0:00").split(":")[0] ?? "0");
          const endHour = parseInt((slotEnd ?? "24:00").split(":")[0] ?? "24");

          let totalCost = 0,
            personalCost = 0;
          let totalActs = 0,
            personalActs = 0;
          let totalPayment = 0,
            personalPayment = 0;

          for (const p of placementList) {
            if (p.account_id !== accountId) continue;
            if (p.date !== date) continue;
            const h = p.hour;
            if (h < startHour || h >= endHour) continue;
            totalCost += p.cost;
            totalActs += p.activations;
            totalPayment += p.payment;
            if (p.attributed_dingtalk_user_id === eff.user) {
              personalCost += p.cost;
              personalActs += p.activations;
              personalPayment += p.payment;
            }
          }

          if (totalCost === 0 && totalActs === 0) continue;

          rows.push({
            date,
            time_slot: [slotStart, slotEnd],
            account_id: accountId,
            account_name: meta.account_name,
            placement_label: meta.placement_label,
            anchor_user_id: eff.user,
            anchor_name: anchorNames.get(eff.user) ?? null,
            total_cost: totalCost,
            personal_cost: personalCost,
            total_acts: totalActs,
            personal_acts: personalActs,
            total_unit_price: totalActs > 0 ? totalCost / totalActs : null,
            personal_unit_price: personalActs > 0 ? personalCost / personalActs : null,
            total_payment: totalPayment,
            personal_payment: personalPayment,
          });
        }
      }
    }
  }

  // 11. Sort: date DESC, then time_slot start
  rows.sort((a, b) => {
    if (a.date > b.date) return -1;
    if (a.date < b.date) return 1;
    return a.time_slot[0].localeCompare(b.time_slot[0]);
  });
  return rows;
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

export async function queryAnchorLabels(filter: BoardFilter): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT DISTINCT a.placement_label
    FROM placement_row p
    JOIN live_account a ON a.id = p.live_account_id
    WHERE p.date BETWEEN ${filter.date_from} AND ${filter.date_to}
    ${datasetClause(filter.dataset_ids)}
      AND a.placement_label IS NOT NULL
    ORDER BY 1
  `);
  return (result as unknown as { placement_label: string }[]).map((r) => r.placement_label);
}
