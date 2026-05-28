import "server-only";
import { db } from "@/db/client";
import { eq, sql, type SQL } from "drizzle-orm";
import { dingtalk_user } from "@/db/schema";
import { resolvePermission, getManagedDeptIds } from "@/modules/permissions/server";
import { mergeWithOverride } from "@/modules/schedule-override";

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
): Promise<PlacementScope> {
  if (emergencyMode) return { kind: "all" };
  const perm = await resolvePermission(userId, "placement");
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
      ${filter.anchor_label ? sql`AND a.placement_label = ${filter.anchor_label}` : sql``}
      ${filter.search ? sql`AND (a.account_name ILIKE ${"%" + filter.search + "%"} OR a.placement_label ILIKE ${"%" + filter.search + "%"})` : sql``}
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

  const dailyRows =
    involvedAccountIds.length > 0
      ? ((await db.execute(sql`
          SELECT
            ds.account_id,
            ds.date::text AS date,
            ds.dingtalk_user_id,
            ds.start_hour,
            ds.end_hour,
            ds.is_rest,
            du.name AS anchor_name
          FROM daily_schedule_segment ds
          LEFT JOIN dingtalk_user du ON du.user_id = ds.dingtalk_user_id
          WHERE ds.date BETWEEN ${filter.date_from} AND ${filter.date_to}
            AND ds.account_id IN (${sql.join(
              involvedAccountIds.map((id) => sql`${id}`),
              sql`, `,
            )})
        `)) as {
          account_id: string;
          date: string;
          dingtalk_user_id: string;
          start_hour: number;
          end_hour: number;
          is_rest: boolean;
          anchor_name: string | null;
        }[])
      : [];

  const dailyMap = new Map<
    string,
    { user: string; slots: [string, string][]; rest_days: number[] }[]
  >();
  for (const row of dailyRows) {
    if (row.is_rest) continue;
    const key = `${row.account_id}::${row.date}`;
    const slot: [string, string] = [
      `${row.start_hour.toString().padStart(2, "0")}:00`,
      `${row.end_hour.toString().padStart(2, "0")}:00`,
    ];
    const rowsForDay = dailyMap.get(key) ?? [];
    const existing = rowsForDay.find((item) => item.user === row.dingtalk_user_id);
    if (existing) {
      existing.slots.push(slot);
    } else {
      rowsForDay.push({ user: row.dingtalk_user_id, slots: [slot], rest_days: [] });
    }
    dailyMap.set(key, rowsForDay);
  }

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
  for (const row of dailyRows) {
    if (!anchorNames.has(row.dingtalk_user_id)) {
      anchorNames.set(row.dingtalk_user_id, row.anchor_name);
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
    ${scopeClause(filter.scope)}
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

  // Index by (account_id, date, hour) for O(1) lookup per slot-hour.
  // 不改语义，去掉每个 slot 都全表扫 placementList 的 N² 行为。
  type PRow = (typeof placementList)[number];
  const placementIndex = new Map<string, PRow[]>();
  for (const p of placementList) {
    const k = `${p.account_id}::${p.date}::${p.hour}`;
    const arr = placementIndex.get(k);
    if (arr) arr.push(p);
    else placementIndex.set(k, [p]);
  }

  function aggregateSlot(
    accountId: string,
    date: string,
    startHour: number,
    endHour: number,
    targetUser: string,
  ): {
    totalCost: number;
    personalCost: number;
    totalActs: number;
    personalActs: number;
    totalPayment: number;
    personalPayment: number;
  } {
    let totalCost = 0,
      personalCost = 0;
    let totalActs = 0,
      personalActs = 0;
    let totalPayment = 0,
      personalPayment = 0;
    for (let h = startHour; h < endHour; h++) {
      const arr = placementIndex.get(`${accountId}::${date}::${h}`);
      if (!arr) continue;
      for (const p of arr) {
        totalCost += p.cost;
        totalActs += p.activations;
        totalPayment += p.payment;
        if (p.attributed_dingtalk_user_id === targetUser) {
          personalCost += p.cost;
          personalActs += p.activations;
          personalPayment += p.payment;
        }
      }
    }
    return { totalCost, personalCost, totalActs, personalActs, totalPayment, personalPayment };
  }

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
      const dailyEffective = dailyMap.get(key);
      if (dailyEffective) {
        for (const eff of dailyEffective) {
          for (const slot of eff.slots) {
            const [slotStart, slotEnd] = slot;
            const startHour = parseInt((slotStart ?? "0:00").split(":")[0] ?? "0");
            const endHour = parseInt((slotEnd ?? "24:00").split(":")[0] ?? "24");

            const {
              totalCost,
              personalCost,
              totalActs,
              personalActs,
              totalPayment,
              personalPayment,
            } = aggregateSlot(accountId, date, startHour, endHour, eff.user);

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
        continue;
      }
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

          const {
            totalCost,
            personalCost,
            totalActs,
            personalActs,
            totalPayment,
            personalPayment,
          } = aggregateSlot(accountId, date, startHour, endHour, eff.user);

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
       AND (p.date::timestamp + interval '1 hour' * p.hour + interval '30 minutes')::timestamptz >= s.start_at
       AND (p.date::timestamp + interval '1 hour' * p.hour + interval '30 minutes')::timestamptz < s.end_at
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

/**
 * 「主播 × 投放」视图的「昨日同时段累计」对比数据。
 *
 * 口径：filter.date 范围各 -1 天作为昨日窗口；
 *   若 filter.date_to ≥ 今天（按 Asia/Shanghai），则 cutoff_hour = 当前 Shanghai 小时（含同时刻截止公平对比）；
 *   否则 cutoff_hour = 24（看历史时全天对比）。
 * 返回：Map<account_id, { cost, acts, payment }>
 */
export interface ScheduleYesterdayKpi {
  cost: number;
  acts: number;
  payment: number;
}

function shanghaiTodayAndHour(): { date: string; hour: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const y = get("year");
  const m = get("month");
  const d = get("day");
  const h = parseInt(get("hour") || "0", 10);
  return { date: `${y}-${m}-${d}`, hour: h };
}

function isoSubDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z"); // noon UTC 避开 DST 边界
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** 昨日按 (account, hour) 维度的小时级累计，client 可按班次 [start, end) 任意求和。 */
export interface ScheduleYesterdayHourly {
  byAccount: Record<string, Record<number, ScheduleYesterdayKpi>>;
  cutoffHour: number; // 用于 account 级 KPI 同比；当 filter.date_to >= 今天时 = 当前 Shanghai 小时，否则 24
}

export async function queryScheduleYesterdayHourly(
  filter: BoardFilter,
): Promise<ScheduleYesterdayHourly> {
  const { date: today, hour: nowHour } = shanghaiTodayAndHour();
  const cutoff = filter.date_to >= today ? nowHour : 24;

  const yFrom = isoSubDays(filter.date_from, 1);
  const yTo = isoSubDays(filter.date_to, 1);

  const rows = (await db.execute(sql`
    SELECT
      p.live_account_id            AS account_id,
      p.hour                       AS hour,
      SUM(p.cost_yuan)::float      AS cost,
      SUM(p.activations)::int      AS acts,
      SUM(p.payment_yuan)::float   AS payment
    FROM placement_row p
    WHERE p.date BETWEEN ${yFrom} AND ${yTo}
    ${datasetClause(filter.dataset_ids)}
    ${scopeClause(filter.scope)}
    GROUP BY p.live_account_id, p.hour
  `)) as unknown as {
    account_id: string;
    hour: number;
    cost: number;
    acts: number;
    payment: number;
  }[];

  const byAccount: Record<string, Record<number, ScheduleYesterdayKpi>> = {};
  for (const r of rows) {
    let bucket = byAccount[r.account_id];
    if (!bucket) {
      bucket = {};
      byAccount[r.account_id] = bucket;
    }
    bucket[r.hour] = {
      cost: Number(r.cost),
      acts: Number(r.acts),
      payment: Number(r.payment),
    };
  }
  return { byAccount, cutoffHour: cutoff };
}
