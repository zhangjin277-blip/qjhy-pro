import "server-only";
import { anchorGroupCte } from "./attribution";
import { db } from "@/db/client";
import { sql, type SQL } from "drizzle-orm";
import type { DashboardScope } from "./scope";
import { scopeAnchorWhere } from "./scope";
import type {
  CoreKpiResponse,
  DashboardOverviewResponse,
  DrawerDailyRow,
  DrawerDetailFilters,
  DrawerDetailResponse,
  DrawerKpiBlock,
  DrawerMetric,
  DrawerTopAnchor,
  ProjectBreakdown,
  ProjectKey,
  Section2Metric,
} from "./types";
import { PROJECT_LABELS, ZHAOHUA_RECRUIT_BROKER_NAME } from "./types";
import type { WorkbenchRankingData, WorkbenchRankingFilters } from "./workbench-ranking-types";

/** Workbench ranking shares dashboard project assignment and broker access boundaries. */
export async function queryWorkbenchRanking(
  filters: WorkbenchRankingFilters,
  scope: DashboardScope,
): Promise<WorkbenchRankingData> {
  if (scope.kind === "reject") return { ...filters, rows: [], total: 0, latestDate: null };
  let source: SQL;
  let value: SQL;
  let extra = sql`TRUE`;
  const aggregation = filters.metric === "acu" ? sql`MAX(d.value)` : sql`SUM(d.value)`;
  if (filters.metric === "flow") {
    if (filters.project === "ddz") {
      source = sql`anchor_game_promo_daily`;
      value = sql`(COALESCE(d.promote_anchor_active_pay_amount_1d, 0) + COALESCE(d.promote_faction_active_pay_amount_1d, 0)) / 0.4 + COALESCE(d.promote_download_pay_amount_1d, 0)`;
      extra = sql`d.promote_scene = 'live' AND d.biz_mode = 'cps_all'`;
    } else {
      source = sql`anchor_minigame_daily`;
      value = sql`d.before_divided_income`;
      extra = sql`d.scene = 'live'`;
    }
  } else if (filters.metric === "uv") {
    source = sql`anchor_portrait_daily`;
    value = sql`d.watch_uv`;
  } else {
    source = sql`anchor_daily`;
    value = filters.metric === "acu" ? sql`d.feed_acu` : sql`d.live_duration_1d`;
  }
  // Deduplicate identities before joining facts: an operator can match multiple department aliases.
  const visible = sql`${anchorGroupCte(scope)}, visible AS (
    SELECT DISTINCT anchor_id FROM anchor_group WHERE project = ${filters.project}
  )`;
  const [ranked, latest] = await Promise.all([
    db.execute(sql`
      WITH ${visible}, daily_values AS (
        SELECT d.anchor_id, ${value} AS value
        FROM ${source} d JOIN visible v ON v.anchor_id = d.anchor_id
        WHERE d.date >= ${filters.date_from} AND d.date <= ${filters.date_to} AND ${extra}
      ), per_anchor AS (
        SELECT d.anchor_id, ${aggregation}::numeric AS value
        FROM daily_values d GROUP BY d.anchor_id HAVING ${aggregation} > 0
      )
      SELECT ap.anchor_id, ap.nick_name, ap.avatar, pa.value, COUNT(*) OVER()::int AS total
      FROM per_anchor pa JOIN anchor_profile ap ON ap.anchor_id = pa.anchor_id
      ORDER BY pa.value DESC, ap.anchor_id ASC LIMIT 100
    `),
    db.execute(sql`
      WITH ${visible}
      SELECT MAX(d.date) AS date FROM ${source} d
      JOIN visible v ON v.anchor_id = d.anchor_id
      WHERE d.date <= ${filters.date_to} AND ${extra}
    `),
  ]);
  const rows = ranked as unknown as Record<string, unknown>[];
  const last = (latest as unknown as { date: string | null }[])[0]?.date ?? null;
  return {
    ...filters,
    rows: rows.map((row) => ({
      id: String(row.anchor_id),
      name: String(row.nick_name || "未命名主播"),
      avatar: row.avatar ? String(row.avatar) : null,
      value: Number(row.value),
    })),
    total: Number(rows[0]?.total ?? 0),
    latestDate: last,
  };
}

/** 空响应（scope=reject 时用，所有数值 0、列表空） */
function emptyOverview(dateFrom: string, dateTo: string): DashboardOverviewResponse {
  const zeroValue = { current: 0, prev_day: 0, prev_week: 0 };
  const zeroProject = (project: ProjectKey): ProjectBreakdown => {
    const zeroCell = (group: ProjectBreakdown["total"]["group"]) => ({
      project,
      group,
      value: 0,
      prev_value: 0,
      vs_prev: null,
      anchor_count: 0,
      sparkline: [],
    });
    return {
      project,
      total: zeroCell("all"),
      online: zeroCell("online"),
      offline: zeroCell("offline"),
      other: zeroCell("other"),
    };
  };
  const metrics: Section2Metric[] = [
    "total_fan_ticket",
    "flow",
    "active_anchor_count",
    "new_anchor_count",
    "first_live_anchor_count",
    "live_flow",
    "video_flow",
    "install_or_activate",
    "show_uv",
    "watch_uv",
  ];
  return {
    date_from: dateFrom,
    date_to: dateTo,
    core: {
      total_fan_ticket: zeroValue,
      flow: zeroValue,
      active_anchor_count: zeroValue,
      new_anchor_count: zeroValue,
      first_live_anchor_count: zeroValue,
    },
    breakdown: metrics.map((m) => ({
      metric: m,
      ddz: zeroProject("ddz"),
      three: zeroProject("three"),
      zhaohua: zeroProject("zhaohua"),
    })),
  };
}

/** 用本地时区格式化 YYYY-MM-DD（避开 toISOString 的 UTC 偏移坑：UTC+8 会整体退一天）*/
function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftDate(date: string, days: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toLocalIsoDate(d);
}

/* ──────────────────── Section 1（不动） ──────────────────── */

/** Section 1 单个周期的 5 KPI */
async function fetchCorePeriod(
  dateFrom: string,
  dateTo: string,
  scope: DashboardScope,
): Promise<{
  total_fan_ticket: number;
  flow: number;
  active_anchor_count: number;
  new_anchor_count: number;
  first_live_anchor_count: number;
}> {
  const fromUnix = Math.floor(new Date(dateFrom + "T00:00:00").getTime() / 1000);
  const toUnix = Math.floor(new Date(dateTo + "T23:59:59").getTime() / 1000);

  const scopeF = scopeAnchorWhere(scope);
  const result = await db.execute(sql`
    WITH daily_sum AS (
      SELECT
        COALESCE(SUM(total_fan_ticket), 0)::numeric AS total_fan_ticket,
        COUNT(DISTINCT anchor_id) FILTER (WHERE live_duration_1d > 0) AS active_anchor_count
      FROM anchor_daily
      WHERE date >= ${dateFrom} AND date <= ${dateTo}
        AND ${scopeF}
    ),
    flow_sum AS (
      SELECT
        COALESCE((
          SELECT SUM(
            (COALESCE(agp.promote_anchor_active_pay_amount_1d, 0) + COALESCE(agp.promote_faction_active_pay_amount_1d, 0)) / 0.4
            + COALESCE(agp.promote_download_pay_amount_1d, 0)
          )
          FROM anchor_game_promo_daily agp
          JOIN anchor_profile ap ON ap.anchor_id = agp.anchor_id
          WHERE ap.is_threekingdoms = FALSE
            AND ap.recruit_broker_name <> ${ZHAOHUA_RECRUIT_BROKER_NAME}
            AND agp.biz_mode = 'cps_all'
            AND agp.date >= ${dateFrom} AND agp.date <= ${dateTo}
            AND ${scopeAnchorWhere(scope, sql`agp.anchor_id`)}
        ), 0)::numeric +
        COALESCE((
          SELECT SUM(mg.before_divided_income)
          FROM anchor_minigame_daily mg
          JOIN anchor_profile ap ON ap.anchor_id = mg.anchor_id
          WHERE (ap.is_threekingdoms = TRUE OR ap.recruit_broker_name = ${ZHAOHUA_RECRUIT_BROKER_NAME})
            AND mg.date >= ${dateFrom} AND mg.date <= ${dateTo}
            AND ${scopeAnchorWhere(scope, sql`mg.anchor_id`)}
        ), 0)::numeric AS flow
    ),
    new_anchor AS (
      SELECT COUNT(*) AS new_anchor_count
      FROM anchor_profile
      WHERE is_archived = FALSE
        AND join_time IS NOT NULL
        AND join_time >= ${fromUnix} AND join_time <= ${toUnix}
        AND ${scopeF}
    ),
    first_live AS (
      SELECT COUNT(*) AS first_live_anchor_count
      FROM anchor_profile
      WHERE is_archived = FALSE
        AND first_live_time_in_faction IS NOT NULL
        AND first_live_time_in_faction > 0
        AND first_live_time_in_faction >= ${fromUnix}
        AND first_live_time_in_faction <= ${toUnix}
        AND ${scopeF}
    )
    SELECT
      ds.total_fan_ticket, ds.active_anchor_count,
      fs.flow, na.new_anchor_count, fl.first_live_anchor_count
    FROM daily_sum ds, flow_sum fs, new_anchor na, first_live fl
  `);

  const row = (result as unknown as Record<string, unknown>[])[0];
  return {
    total_fan_ticket: Number(row?.total_fan_ticket ?? 0),
    flow: Number(row?.flow ?? 0),
    active_anchor_count: Number(row?.active_anchor_count ?? 0),
    new_anchor_count: Number(row?.new_anchor_count ?? 0),
    first_live_anchor_count: Number(row?.first_live_anchor_count ?? 0),
  };
}

/**
 * KPI 卡走势小图数据：近 N 天（含今天）每天 5 指标值，缺日补 0。
 * 固定窗口、与用户所选区间无关 —— 走势图表达的是"最近的节奏"。
 */
async function fetchCoreTrend(
  scope: DashboardScope,
  days = 14,
): Promise<Record<keyof CoreKpiResponse, number[]>> {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  const from = shiftDate(today, -(days - 1));
  const fromUnix = Math.floor(new Date(from + "T00:00:00").getTime() / 1000);
  const scopeF = scopeAnchorWhere(scope);

  const [dailyRows, flowCpsRows, flowMgRows, joinRows, firstRows] = await Promise.all([
    db.execute(sql`
      SELECT date::text AS d,
        COALESCE(SUM(total_fan_ticket), 0)::numeric AS fan,
        COUNT(DISTINCT anchor_id) FILTER (WHERE live_duration_1d > 0) AS act
      FROM anchor_daily
      WHERE date >= ${from} AND date <= ${today} AND ${scopeF}
      GROUP BY date
    `),
    db.execute(sql`
      SELECT agp.date::text AS d,
        SUM(
          (COALESCE(agp.promote_anchor_active_pay_amount_1d, 0) + COALESCE(agp.promote_faction_active_pay_amount_1d, 0)) / 0.4
          + COALESCE(agp.promote_download_pay_amount_1d, 0)
        )::numeric AS v
      FROM anchor_game_promo_daily agp
      JOIN anchor_profile ap ON ap.anchor_id = agp.anchor_id
      WHERE ap.is_threekingdoms = FALSE AND agp.biz_mode = 'cps_all'
        AND agp.date >= ${from} AND agp.date <= ${today}
        AND ${scopeAnchorWhere(scope, sql`agp.anchor_id`)}
      GROUP BY agp.date
    `),
    db.execute(sql`
      SELECT mg.date::text AS d, SUM(mg.before_divided_income)::numeric AS v
      FROM anchor_minigame_daily mg
      JOIN anchor_profile ap ON ap.anchor_id = mg.anchor_id
      WHERE ap.is_threekingdoms = TRUE
        AND mg.date >= ${from} AND mg.date <= ${today}
        AND ${scopeAnchorWhere(scope, sql`mg.anchor_id`)}
      GROUP BY mg.date
    `),
    db.execute(sql`
      SELECT to_char(to_timestamp(join_time) AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS d,
        COUNT(*) AS v
      FROM anchor_profile
      WHERE is_archived = FALSE AND join_time IS NOT NULL AND join_time >= ${fromUnix} AND ${scopeF}
      GROUP BY d
    `),
    db.execute(sql`
      SELECT to_char(to_timestamp(first_live_time_in_faction) AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS d,
        COUNT(*) AS v
      FROM anchor_profile
      WHERE is_archived = FALSE AND first_live_time_in_faction IS NOT NULL
        AND first_live_time_in_faction > 0 AND first_live_time_in_faction >= ${fromUnix} AND ${scopeF}
      GROUP BY d
    `),
  ]);

  const dates: string[] = [];
  for (let i = 0; i < days; i++) dates.push(shiftDate(from, i));

  const toMap = (rows: unknown, key: string): Map<string, number> => {
    const m = new Map<string, number>();
    for (const r of rows as Record<string, unknown>[]) {
      m.set(String(r.d), Number(r[key] ?? 0));
    }
    return m;
  };
  const fanMap = toMap(dailyRows, "fan");
  const actMap = toMap(dailyRows, "act");
  const cpsMap = toMap(flowCpsRows, "v");
  const mgMap = toMap(flowMgRows, "v");
  const joinMap = toMap(joinRows, "v");
  const firstMap = toMap(firstRows, "v");

  return {
    total_fan_ticket: dates.map((d) => fanMap.get(d) ?? 0),
    flow: dates.map((d) => (cpsMap.get(d) ?? 0) + (mgMap.get(d) ?? 0)),
    active_anchor_count: dates.map((d) => actMap.get(d) ?? 0),
    new_anchor_count: dates.map((d) => joinMap.get(d) ?? 0),
    first_live_anchor_count: dates.map((d) => firstMap.get(d) ?? 0),
  };
}

export async function getCoreKpis(
  dateFrom: string,
  dateTo: string,
  scope: DashboardScope,
): Promise<CoreKpiResponse> {
  const days =
    Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400_000) + 1;

  const prevDayFrom = shiftDate(dateFrom, -days);
  const prevDayTo = shiftDate(dateTo, -days);
  const prevWeekFrom = shiftDate(dateFrom, -7);
  const prevWeekTo = shiftDate(dateTo, -7);

  const [current, prevDay, prevWeek, trend] = await Promise.all([
    fetchCorePeriod(dateFrom, dateTo, scope),
    fetchCorePeriod(prevDayFrom, prevDayTo, scope),
    fetchCorePeriod(prevWeekFrom, prevWeekTo, scope),
    fetchCoreTrend(scope),
  ]);

  return {
    total_fan_ticket: {
      current: current.total_fan_ticket,
      prev_day: prevDay.total_fan_ticket,
      prev_week: prevWeek.total_fan_ticket,
      trend: trend.total_fan_ticket,
    },
    flow: {
      current: current.flow,
      prev_day: prevDay.flow,
      prev_week: prevWeek.flow,
      trend: trend.flow,
    },
    active_anchor_count: {
      current: current.active_anchor_count,
      prev_day: prevDay.active_anchor_count,
      prev_week: prevWeek.active_anchor_count,
      trend: trend.active_anchor_count,
    },
    new_anchor_count: {
      current: current.new_anchor_count,
      prev_day: prevDay.new_anchor_count,
      prev_week: prevWeek.new_anchor_count,
      trend: trend.new_anchor_count,
    },
    first_live_anchor_count: {
      current: current.first_live_anchor_count,
      prev_day: prevDay.first_live_anchor_count,
      prev_week: prevWeek.first_live_anchor_count,
      trend: trend.first_live_anchor_count,
    },
  };
}

/* ──────────────────── Section 2 （5 个新 metric） ──────────────────── */

/**
 * Section 2 metric × project × group 的聚合（当前周期）。
 *
 * 「不适用」（如三国 + video_flow）会缺席返回；buildCell() 时识别为 not_applicable。
 */
async function fetchGroupBreakdown(
  metric: Section2Metric,
  dateFrom: string,
  dateTo: string,
  scope: DashboardScope,
  groups: SQL = anchorGroupCte(scope),
): Promise<
  {
    project: ProjectKey;
    group: "online" | "offline" | "other";
    value: number;
    anchor_count: number;
  }[]
> {
  // ─── total_fan_ticket / active_anchor_count：anchor_daily 通用 ──────────────
  if (metric === "total_fan_ticket" || metric === "active_anchor_count") {
    const valueExpr =
      metric === "total_fan_ticket"
        ? sql`COALESCE(SUM(ad.total_fan_ticket), 0)::numeric`
        : sql`COUNT(DISTINCT ad.anchor_id) FILTER (WHERE ad.live_duration_1d > 0)::numeric`;
    const result = await db.execute(sql`
      WITH ${groups}
      SELECT ag.project, ag."group",
        ${valueExpr} AS value,
        COUNT(DISTINCT ag.anchor_id)::int AS anchor_count
      FROM anchor_daily ad
      JOIN anchor_group ag ON ag.anchor_id = ad.anchor_id
      WHERE ad.date >= ${dateFrom} AND ad.date <= ${dateTo}
      GROUP BY ag.project, ag."group"
    `);
    const rows = result as unknown as Record<string, unknown>[];
    return rows.map((r) => ({
      project: String(r.project) as ProjectKey,
      group: String(r.group) as "online" | "offline" | "other",
      value: Number(r.value ?? 0),
      anchor_count: Number(r.anchor_count ?? 0),
    }));
  }

  // ─── new_anchor_count：anchor_profile.join_time 在 range 内的计数 ──────────────
  if (metric === "new_anchor_count") {
    const fromUnix = Math.floor(new Date(dateFrom + "T00:00:00").getTime() / 1000);
    const toUnix = Math.floor(new Date(dateTo + "T23:59:59").getTime() / 1000);
    const result = await db.execute(sql`
      WITH ${groups}
      SELECT ag.project, ag."group",
        COUNT(*)::numeric AS value,
        COUNT(DISTINCT ap.anchor_id)::int AS anchor_count
      FROM anchor_profile ap
      JOIN anchor_group ag ON ag.anchor_id = ap.anchor_id
      WHERE ap.join_time IS NOT NULL
        AND ap.join_time >= ${fromUnix} AND ap.join_time <= ${toUnix}
      GROUP BY ag.project, ag."group"
    `);
    const rows = result as unknown as Record<string, unknown>[];
    return rows.map((r) => ({
      project: String(r.project) as ProjectKey,
      group: String(r.group) as "online" | "offline" | "other",
      value: Number(r.value ?? 0),
      anchor_count: Number(r.anchor_count ?? 0),
    }));
  }

  // ─── first_live_anchor_count：anchor_profile.first_live_time_in_faction 在 range 内 ──
  if (metric === "first_live_anchor_count") {
    const fromUnix = Math.floor(new Date(dateFrom + "T00:00:00").getTime() / 1000);
    const toUnix = Math.floor(new Date(dateTo + "T23:59:59").getTime() / 1000);
    const result = await db.execute(sql`
      WITH ${groups}
      SELECT ag.project, ag."group",
        COUNT(*)::numeric AS value,
        COUNT(DISTINCT ap.anchor_id)::int AS anchor_count
      FROM anchor_profile ap
      JOIN anchor_group ag ON ag.anchor_id = ap.anchor_id
      WHERE ap.first_live_time_in_faction IS NOT NULL
        AND ap.first_live_time_in_faction > 0
        AND ap.first_live_time_in_faction >= ${fromUnix}
        AND ap.first_live_time_in_faction <= ${toUnix}
      GROUP BY ag.project, ag."group"
    `);
    const rows = result as unknown as Record<string, unknown>[];
    return rows.map((r) => ({
      project: String(r.project) as ProjectKey,
      group: String(r.group) as "online" | "offline" | "other",
      value: Number(r.value ?? 0),
      anchor_count: Number(r.anchor_count ?? 0),
    }));
  }

  // ─── flow（斗地主 CPS；造化/三国小游戏） ────────────────────────────────
  if (metric === "flow") {
    const result = await db.execute(sql`
      WITH ${groups},
      ddz_part AS (
        SELECT ag.project, ag."group",
          SUM(
            (COALESCE(agp.promote_anchor_active_pay_amount_1d, 0) + COALESCE(agp.promote_faction_active_pay_amount_1d, 0)) / 0.4
            + COALESCE(agp.promote_download_pay_amount_1d, 0)
          )::numeric AS value,
          COUNT(DISTINCT ag.anchor_id)::int AS anchor_count
        FROM anchor_game_promo_daily agp
        JOIN anchor_group ag ON ag.anchor_id = agp.anchor_id
        WHERE ag.project = 'ddz'
          AND agp.biz_mode = 'cps_all'
          AND agp.date >= ${dateFrom} AND agp.date <= ${dateTo}
        GROUP BY ag.project, ag."group"
      ),
      minigame_part AS (
        SELECT ag.project, ag."group",
          SUM(mg.before_divided_income)::numeric AS value,
          COUNT(DISTINCT ag.anchor_id)::int AS anchor_count
        FROM anchor_minigame_daily mg
        JOIN anchor_group ag ON ag.anchor_id = mg.anchor_id
        WHERE ag.project IN ('three', 'zhaohua')
          AND mg.date >= ${dateFrom} AND mg.date <= ${dateTo}
        GROUP BY ag.project, ag."group"
      )
      SELECT * FROM ddz_part UNION ALL SELECT * FROM minigame_part
    `);
    const rows = result as unknown as Record<string, unknown>[];
    return rows.map((r) => ({
      project: String(r.project) as ProjectKey,
      group: String(r.group) as "online" | "offline" | "other",
      value: Number(r.value ?? 0),
      anchor_count: Number(r.anchor_count ?? 0),
    }));
  }

  // ─── show_uv / watch_uv：anchor_portrait_daily 通用 ──────────────
  if (metric === "show_uv" || metric === "watch_uv") {
    const col = metric === "show_uv" ? sql`pd.show_uv` : sql`pd.watch_uv`;
    const result = await db.execute(sql`
      WITH ${groups}
      SELECT ag.project, ag."group",
        COALESCE(SUM(${col}), 0)::numeric AS value,
        COUNT(DISTINCT ag.anchor_id)::int AS anchor_count
      FROM anchor_portrait_daily pd
      JOIN anchor_group ag ON ag.anchor_id = pd.anchor_id
      WHERE pd.date >= ${dateFrom} AND pd.date <= ${dateTo}
      GROUP BY ag.project, ag."group"
    `);
    const rows = result as unknown as Record<string, unknown>[];
    return rows.map((r) => ({
      project: String(r.project) as ProjectKey,
      group: String(r.group) as "online" | "offline" | "other",
      value: Number(r.value ?? 0),
      anchor_count: Number(r.anchor_count ?? 0),
    }));
  }

  // ─── live_flow / video_flow：斗地主 CPS；造化/三国直播小游戏 ─────────────
  if (metric === "live_flow" || metric === "video_flow") {
    const scene = metric === "live_flow" ? "live" : "video";
    // CPS 项目分支：cps_all + promote_scene 限定
    const ddzPart = sql`
      ddz_part AS (
        SELECT ag.project, ag."group",
          SUM(
            (COALESCE(agp.promote_anchor_active_pay_amount_1d, 0) + COALESCE(agp.promote_faction_active_pay_amount_1d, 0)) / 0.4
            + COALESCE(agp.promote_download_pay_amount_1d, 0)
          )::numeric AS value,
          COUNT(DISTINCT ag.anchor_id)::int AS anchor_count
        FROM anchor_game_promo_daily agp
        JOIN anchor_group ag ON ag.anchor_id = agp.anchor_id
        WHERE ag.project = 'ddz'
          AND agp.biz_mode = 'cps_all'
          AND agp.promote_scene = ${scene}
          AND agp.date >= ${dateFrom} AND agp.date <= ${dateTo}
        GROUP BY ag.project, ag."group"
      )
    `;
    // 造化/三国分支：仅 live_flow 有数据
    const threePart =
      metric === "live_flow"
        ? sql`,
      minigame_part AS (
        SELECT ag.project, ag."group",
          SUM(mg.before_divided_income)::numeric AS value,
          COUNT(DISTINCT ag.anchor_id)::int AS anchor_count
        FROM anchor_minigame_daily mg
        JOIN anchor_group ag ON ag.anchor_id = mg.anchor_id
        WHERE ag.project IN ('three', 'zhaohua')
          AND mg.date >= ${dateFrom} AND mg.date <= ${dateTo}
        GROUP BY ag.project, ag."group"
      )
      SELECT * FROM ddz_part UNION ALL SELECT * FROM minigame_part
    `
        : sql`
      SELECT * FROM ddz_part
    `;
    const result = await db.execute(sql`
      WITH ${groups},
      ${ddzPart}${threePart}
    `);
    const rows = result as unknown as Record<string, unknown>[];
    return rows.map((r) => ({
      project: String(r.project) as ProjectKey,
      group: String(r.group) as "online" | "offline" | "other",
      value: Number(r.value ?? 0),
      anchor_count: Number(r.anchor_count ?? 0),
    }));
  }

  // ─── install_or_activate：斗地主 = cps install_finish；造化/三国 = minigame gm_active_ucnt ─
  if (metric === "install_or_activate") {
    const result = await db.execute(sql`
      WITH ${groups},
      ddz_part AS (
        SELECT ag.project, ag."group",
          COALESCE(SUM(agp.promote_install_finish_ucnt_1d), 0)::numeric AS value,
          COUNT(DISTINCT ag.anchor_id)::int AS anchor_count
        FROM anchor_game_promo_daily agp
        JOIN anchor_group ag ON ag.anchor_id = agp.anchor_id
        WHERE ag.project = 'ddz'
          AND agp.biz_mode = 'cps'
          AND agp.date >= ${dateFrom} AND agp.date <= ${dateTo}
        GROUP BY ag.project, ag."group"
      ),
      three_part AS (
        SELECT ag.project, ag."group",
          COALESCE(SUM(mg.gm_active_ucnt), 0)::numeric AS value,
          COUNT(DISTINCT ag.anchor_id)::int AS anchor_count
        FROM anchor_minigame_daily mg
        JOIN anchor_group ag ON ag.anchor_id = mg.anchor_id
        WHERE ag.project IN ('three', 'zhaohua')
          AND mg.date >= ${dateFrom} AND mg.date <= ${dateTo}
        GROUP BY ag.project, ag."group"
      )
      SELECT * FROM ddz_part UNION ALL SELECT * FROM three_part
    `);
    const rows = result as unknown as Record<string, unknown>[];
    return rows.map((r) => ({
      project: String(r.project) as ProjectKey,
      group: String(r.group) as "online" | "offline" | "other",
      value: Number(r.value ?? 0),
      anchor_count: Number(r.anchor_count ?? 0),
    }));
  }

  return [];
}

/** sparkline：日级数组（升序，按 dateFrom..dateTo 取数据库返回的天，没数据的日子简单丢弃） */
async function fetchSparkline(
  metric: Section2Metric,
  project: ProjectKey,
  group: "online" | "offline" | "other",
  dateFrom: string,
  dateTo: string,
  scope: DashboardScope,
  groups: SQL = anchorGroupCte(scope),
): Promise<number[]> {
  // 三国 + video_flow → 不适用
  if (project === "three" && metric === "video_flow") return [];

  // total_fan_ticket / active_anchor_count：anchor_daily 通用
  if (metric === "total_fan_ticket" || metric === "active_anchor_count") {
    const valueExpr =
      metric === "total_fan_ticket"
        ? sql`COALESCE(SUM(ad.total_fan_ticket), 0)::numeric`
        : sql`COUNT(DISTINCT ad.anchor_id) FILTER (WHERE ad.live_duration_1d > 0)::numeric`;
    const result = await db.execute(sql`
      WITH ${groups}
      SELECT ad.date AS d, ${valueExpr} AS v
      FROM anchor_daily ad
      JOIN anchor_group ag ON ag.anchor_id = ad.anchor_id
      WHERE ag.project = ${project} AND ag."group" = ${group}
        AND ad.date >= ${dateFrom} AND ad.date <= ${dateTo}
      GROUP BY ad.date ORDER BY ad.date
    `);
    return (result as unknown as Record<string, unknown>[]).map((r) => Number(r.v ?? 0));
  }

  // new_anchor_count：按 join_time 入驻日聚合
  if (metric === "new_anchor_count") {
    const fromUnix = Math.floor(new Date(dateFrom + "T00:00:00").getTime() / 1000);
    const toUnix = Math.floor(new Date(dateTo + "T23:59:59").getTime() / 1000);
    const result = await db.execute(sql`
      WITH ${groups}
      SELECT TO_CHAR(TO_TIMESTAMP(ap.join_time), 'YYYY-MM-DD') AS d,
        COUNT(*)::numeric AS v
      FROM anchor_profile ap
      JOIN anchor_group ag ON ag.anchor_id = ap.anchor_id
      WHERE ag.project = ${project} AND ag."group" = ${group}
        AND ap.join_time IS NOT NULL
        AND ap.join_time >= ${fromUnix} AND ap.join_time <= ${toUnix}
      GROUP BY 1 ORDER BY 1
    `);
    return (result as unknown as Record<string, unknown>[]).map((r) => Number(r.v ?? 0));
  }

  // first_live_anchor_count：每天首播主播数（按 anchor_profile.first_live_time_in_faction）
  if (metric === "first_live_anchor_count") {
    const fromUnix = Math.floor(new Date(dateFrom + "T00:00:00").getTime() / 1000);
    const toUnix = Math.floor(new Date(dateTo + "T23:59:59").getTime() / 1000);
    const result = await db.execute(sql`
      WITH ${groups}
      SELECT TO_CHAR(TO_TIMESTAMP(ap.first_live_time_in_faction), 'YYYY-MM-DD') AS d,
        COUNT(*)::numeric AS v
      FROM anchor_profile ap
      JOIN anchor_group ag ON ag.anchor_id = ap.anchor_id
      WHERE ag.project = ${project} AND ag."group" = ${group}
        AND ap.first_live_time_in_faction IS NOT NULL
        AND ap.first_live_time_in_faction > 0
        AND ap.first_live_time_in_faction >= ${fromUnix}
        AND ap.first_live_time_in_faction <= ${toUnix}
      GROUP BY 1 ORDER BY 1
    `);
    return (result as unknown as Record<string, unknown>[]).map((r) => Number(r.v ?? 0));
  }

  // flow：斗地主 CPS；造化/三国小游戏
  if (metric === "flow") {
    if (project === "ddz") {
      const result = await db.execute(sql`
        WITH ${groups}
        SELECT agp.date AS d,
          COALESCE(SUM(
            (COALESCE(agp.promote_anchor_active_pay_amount_1d, 0) + COALESCE(agp.promote_faction_active_pay_amount_1d, 0)) / 0.4
            + COALESCE(agp.promote_download_pay_amount_1d, 0)
          ), 0)::numeric AS v
        FROM anchor_game_promo_daily agp
        JOIN anchor_group ag ON ag.anchor_id = agp.anchor_id
        WHERE ag.project = ${project} AND ag."group" = ${group}
          AND agp.biz_mode = 'cps_all'
          AND agp.date >= ${dateFrom} AND agp.date <= ${dateTo}
        GROUP BY agp.date ORDER BY agp.date
      `);
      return (result as unknown as Record<string, unknown>[]).map((r) => Number(r.v ?? 0));
    }
    const result = await db.execute(sql`
      WITH ${groups}
      SELECT mg.date AS d, COALESCE(SUM(mg.before_divided_income), 0)::numeric AS v
      FROM anchor_minigame_daily mg
      JOIN anchor_group ag ON ag.anchor_id = mg.anchor_id
      WHERE ag.project IN ('three', 'zhaohua') AND ag."group" = ${group}
        AND mg.date >= ${dateFrom} AND mg.date <= ${dateTo}
      GROUP BY mg.date ORDER BY mg.date
    `);
    return (result as unknown as Record<string, unknown>[]).map((r) => Number(r.v ?? 0));
  }

  if (metric === "show_uv" || metric === "watch_uv") {
    const col = metric === "show_uv" ? sql`pd.show_uv` : sql`pd.watch_uv`;
    const result = await db.execute(sql`
      WITH ${groups}
      SELECT pd.date AS d, COALESCE(SUM(${col}), 0)::numeric AS v
      FROM anchor_portrait_daily pd
      JOIN anchor_group ag ON ag.anchor_id = pd.anchor_id
      WHERE ag.project = ${project} AND ag."group" = ${group}
        AND pd.date >= ${dateFrom} AND pd.date <= ${dateTo}
      GROUP BY pd.date ORDER BY pd.date
    `);
    return (result as unknown as Record<string, unknown>[]).map((r) => Number(r.v ?? 0));
  }

  if (metric === "live_flow" || metric === "video_flow") {
    if (project === "ddz") {
      const scene = metric === "live_flow" ? "live" : "video";
      const result = await db.execute(sql`
        WITH ${groups}
        SELECT agp.date AS d,
          COALESCE(SUM(
            (COALESCE(agp.promote_anchor_active_pay_amount_1d, 0) + COALESCE(agp.promote_faction_active_pay_amount_1d, 0)) / 0.4
            + COALESCE(agp.promote_download_pay_amount_1d, 0)
          ), 0)::numeric AS v
        FROM anchor_game_promo_daily agp
        JOIN anchor_group ag ON ag.anchor_id = agp.anchor_id
      WHERE ag.project = ${project} AND ag."group" = ${group}
          AND agp.biz_mode = 'cps_all' AND agp.promote_scene = ${scene}
          AND agp.date >= ${dateFrom} AND agp.date <= ${dateTo}
        GROUP BY agp.date ORDER BY agp.date
      `);
      return (result as unknown as Record<string, unknown>[]).map((r) => Number(r.v ?? 0));
    }
    // three + live_flow
    const result = await db.execute(sql`
      WITH ${groups}
      SELECT mg.date AS d, COALESCE(SUM(mg.before_divided_income), 0)::numeric AS v
      FROM anchor_minigame_daily mg
      JOIN anchor_group ag ON ag.anchor_id = mg.anchor_id
      WHERE ag.project IN ('three', 'zhaohua') AND ag."group" = ${group}
        AND mg.date >= ${dateFrom} AND mg.date <= ${dateTo}
      GROUP BY mg.date ORDER BY mg.date
    `);
    return (result as unknown as Record<string, unknown>[]).map((r) => Number(r.v ?? 0));
  }

  if (metric === "install_or_activate") {
    if (project === "ddz") {
      const result = await db.execute(sql`
        WITH ${groups}
        SELECT agp.date AS d,
          COALESCE(SUM(agp.promote_install_finish_ucnt_1d), 0)::numeric AS v
        FROM anchor_game_promo_daily agp
        JOIN anchor_group ag ON ag.anchor_id = agp.anchor_id
        WHERE ag.project = ${project} AND ag."group" = ${group}
          AND agp.biz_mode = 'cps'
          AND agp.date >= ${dateFrom} AND agp.date <= ${dateTo}
        GROUP BY agp.date ORDER BY agp.date
      `);
      return (result as unknown as Record<string, unknown>[]).map((r) => Number(r.v ?? 0));
    }
    const result = await db.execute(sql`
      WITH ${groups}
      SELECT mg.date AS d, COALESCE(SUM(mg.gm_active_ucnt), 0)::numeric AS v
      FROM anchor_minigame_daily mg
      JOIN anchor_group ag ON ag.anchor_id = mg.anchor_id
      WHERE ag.project IN ('three', 'zhaohua') AND ag."group" = ${group}
        AND mg.date >= ${dateFrom} AND mg.date <= ${dateTo}
      GROUP BY mg.date ORDER BY mg.date
    `);
    return (result as unknown as Record<string, unknown>[]).map((r) => Number(r.v ?? 0));
  }

  return [];
}

interface BreakdownContext {
  anchorGroup: SQL;
  rodMap: Map<string, number>;
}

async function fetchRodCounts(dateFrom: string, dateTo: string, groups: SQL) {
  const rodResult = await db.execute(sql`
    WITH ${groups}, minigame_live AS (
      SELECT anchor_id, date
      FROM anchor_minigame_daily
      WHERE date >= ${dateFrom} AND date <= ${dateTo}
        AND COALESCE(live_duration, 0) > 0
      GROUP BY anchor_id, date
    )
    SELECT ag.project, ag."group", COUNT(DISTINCT ad.anchor_id)::numeric AS rod_anchor_count
    FROM anchor_daily ad
    JOIN anchor_group ag ON ag.anchor_id = ad.anchor_id
    JOIN minigame_live mg ON mg.anchor_id = ad.anchor_id AND mg.date = ad.date
    WHERE ad.date >= ${dateFrom} AND ad.date <= ${dateTo}
      AND COALESCE(ad.live_duration_1d, 0) > 0
    GROUP BY ag.project, ag."group"
  `);
  const rodMap = new Map<string, number>();
  (rodResult as unknown as Record<string, unknown>[]).forEach((row) => {
    rodMap.set(`${row.project}:${row.group}`, Number(row.rod_anchor_count ?? 0));
  });

  return rodMap;
}

async function resolveAnchorGroup(scope: DashboardScope): Promise<SQL> {
  // Product attribution scans historical game evidence. Resolve it once for this request,
  // then reuse the same scoped rows for every metric and sparkline. Never cache across users.
  const rows = await db.execute(sql`
    WITH ${anchorGroupCte(scope)}
    SELECT anchor_id, is_threekingdoms, operator_id, dept_id, project, "group" FROM anchor_group
  `);
  return sql`anchor_group AS (
    SELECT * FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS attributed(
      anchor_id text, is_threekingdoms boolean, operator_id text,
      dept_id text, project text, "group" text
    )
  )`;
}

async function breakdownContext(
  dateFrom: string,
  dateTo: string,
  scope: DashboardScope,
): Promise<BreakdownContext> {
  const anchorGroup = await resolveAnchorGroup(scope);
  return { anchorGroup, rodMap: await fetchRodCounts(dateFrom, dateTo, anchorGroup) };
}

export async function getSection2Breakdown(
  metric: Section2Metric,
  dateFrom: string,
  dateTo: string,
  scope: DashboardScope,
  context?: BreakdownContext,
): Promise<Record<ProjectKey, ProjectBreakdown>> {
  const groups = context?.anchorGroup ?? anchorGroupCte(scope);
  const days =
    Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400_000) + 1;
  const prevFrom = shiftDate(dateFrom, -days);
  const prevTo = shiftDate(dateTo, -days);

  const [current, prev] = await Promise.all([
    fetchGroupBreakdown(metric, dateFrom, dateTo, scope, groups),
    fetchGroupBreakdown(metric, prevFrom, prevTo, scope, groups),
  ]);

  const map = new Map<string, { value: number; anchor_count: number }>();
  current.forEach((r) =>
    map.set(`${r.project}:${r.group}`, { value: r.value, anchor_count: r.anchor_count }),
  );
  const prevMap = new Map<string, number>();
  prev.forEach((r) => prevMap.set(`${r.project}:${r.group}`, r.value));

  // sparklines（9 个 cell × N 天）
  const sparklineKeys: [ProjectKey, "online" | "offline" | "other"][] = [
    ["ddz", "online"],
    ["ddz", "offline"],
    ["ddz", "other"],
    ["three", "online"],
    ["three", "offline"],
    ["three", "other"],
    ["zhaohua", "online"],
    ["zhaohua", "offline"],
    ["zhaohua", "other"],
  ];
  const sparklines = await Promise.all(
    sparklineKeys.map(([p, g]) => fetchSparkline(metric, p, g, dateFrom, dateTo, scope, groups)),
  );
  const sparkMap = new Map<string, number[]>();
  sparklineKeys.forEach(([p, g], i) => sparkMap.set(`${p}:${g}`, sparklines[i] ?? []));

  const rodMap = context?.rodMap ?? (await fetchRodCounts(dateFrom, dateTo, groups));

  function isNotApplicable(project: ProjectKey): boolean {
    return project === "three" && metric === "video_flow";
  }

  function buildCell(
    project: ProjectKey,
    group: "online" | "offline" | "other",
  ): ProjectBreakdown["online"] {
    const notApplicable = isNotApplicable(project);
    if (notApplicable) {
      return {
        project,
        group,
        value: 0,
        prev_value: null,
        vs_prev: null,
        anchor_count: 0,
        sparkline: [],
        not_applicable: true,
      };
    }
    const cur = map.get(`${project}:${group}`);
    const prevValue = prevMap.get(`${project}:${group}`) ?? 0;
    const value = cur?.value ?? 0;
    const vsPrev = prevValue > 0 ? ((value - prevValue) / prevValue) * 100 : null;
    return {
      project,
      group,
      value,
      prev_value: prevValue,
      vs_prev: vsPrev,
      anchor_count: cur?.anchor_count ?? 0,
      rod_anchor_count: rodMap.get(`${project}:${group}`) ?? 0,
      sparkline: sparkMap.get(`${project}:${group}`) ?? [],
    };
  }

  function buildProject(project: ProjectKey): ProjectBreakdown {
    const online = buildCell(project, "online");
    const offline = buildCell(project, "offline");
    const other = buildCell(project, "other");
    const notApplicable = isNotApplicable(project);
    if (notApplicable) {
      return {
        project,
        total: {
          project,
          group: "all",
          value: 0,
          prev_value: null,
          vs_prev: null,
          anchor_count: 0,
          sparkline: [],
          not_applicable: true,
        },
        online,
        offline,
        other,
      };
    }
    const totalValue = online.value + offline.value + other.value;
    const prevTotal =
      (prevMap.get(`${project}:online`) ?? 0) +
      (prevMap.get(`${project}:offline`) ?? 0) +
      (prevMap.get(`${project}:other`) ?? 0);
    const totalCount = online.anchor_count + offline.anchor_count + other.anchor_count;
    const totalVsPrev = prevTotal > 0 ? ((totalValue - prevTotal) / prevTotal) * 100 : null;
    return {
      project,
      total: {
        project,
        group: "all",
        value: totalValue,
        prev_value: prevTotal,
        vs_prev: totalVsPrev,
        anchor_count: totalCount,
        sparkline: [],
      },
      online,
      offline,
      other,
    };
  }

  return {
    ddz: buildProject("ddz"),
    three: buildProject("three"),
    zhaohua: buildProject("zhaohua"),
  };
}

export async function getDashboardOverview(
  dateFrom: string,
  dateTo: string,
  scope: DashboardScope,
): Promise<DashboardOverviewResponse> {
  if (scope.kind === "reject") return emptyOverview(dateFrom, dateTo);

  const metrics: Section2Metric[] = [
    "total_fan_ticket",
    "flow",
    "active_anchor_count",
    "new_anchor_count",
    "first_live_anchor_count",
    "live_flow",
    "video_flow",
    "install_or_activate",
    "show_uv",
    "watch_uv",
  ];
  const [core, breakdownArr] = await Promise.all([
    getCoreKpis(dateFrom, dateTo, scope),
    (async () => {
      const context = await breakdownContext(dateFrom, dateTo, scope);
      return Promise.all(
        metrics.map(async (metric) => ({
          metric,
          ...(await getSection2Breakdown(metric, dateFrom, dateTo, scope, context)),
        })),
      );
    })(),
  ]);
  return {
    date_from: dateFrom,
    date_to: dateTo,
    core,
    breakdown: breakdownArr,
  };
}

/* ──────────────────── 抽屉详情（重构：一次性查 9 维度日级数据） ──────────────────── */

const GROUP_LABEL: Record<"all" | "online" | "offline" | "other", string> = {
  all: "总",
  online: "线上",
  offline: "线下",
  other: "其他",
};

function buildTitle(filters: DrawerDetailFilters): string {
  if (!filters.project) return "全业务";
  const project = PROJECT_LABELS[filters.project];
  const group = filters.group ? GROUP_LABEL[filters.group] : "总";
  return `${project} · ${group}`;
}

/**
 * 构造 (project, group) 过滤条件 SQL 片段。
 *
 * - filters.project = undefined → 不限项目
 * - filters.group = undefined / "all" → 不限分组（"all" 即 total）
 */
function groupFilter(filters: DrawerDetailFilters): SQL {
  const conditions: SQL[] = [];
  if (filters.project) conditions.push(sql`ag.project = ${filters.project}`);
  if (filters.group && filters.group !== "all") {
    conditions.push(sql`ag."group" = ${filters.group}`);
  }
  if (conditions.length === 0) return sql`TRUE`;
  return sql.join(conditions, sql` AND `);
}

/**
 * 单周期日级数据（每 metric 一条 SQL，按日聚合）。返回 9 个 metric → date → value 嵌套表。
 */
async function fetchDailyMatrix(
  filters: DrawerDetailFilters,
  dateFrom: string,
  dateTo: string,
  groups: SQL,
): Promise<Map<DrawerMetric, Map<string, number>>> {
  const fromUnix = Math.floor(new Date(dateFrom + "T00:00:00").getTime() / 1000);
  const toUnix = Math.floor(new Date(dateTo + "T23:59:59").getTime() / 1000);
  const shouldGame = !filters.project || filters.project === "ddz";
  const shouldMini =
    !filters.project || filters.project === "three" || filters.project === "zhaohua";

  const adailyP = db.execute(sql`
    WITH ${groups}
    SELECT ad.date AS d,
      COALESCE(SUM(ad.total_fan_ticket), 0)::numeric AS total_fan_ticket,
      COUNT(DISTINCT ad.anchor_id) FILTER (WHERE ad.live_duration_1d > 0)::int AS active_anchor_count
    FROM anchor_daily ad JOIN anchor_group ag ON ag.anchor_id = ad.anchor_id
    WHERE ${groupFilter(filters)} AND ad.date >= ${dateFrom} AND ad.date <= ${dateTo}
    GROUP BY ad.date ORDER BY ad.date
  `);

  const gamePromoP = shouldGame
    ? db.execute(sql`
        WITH ${groups}
        SELECT agp.date AS d,
          COALESCE(SUM(CASE WHEN agp.biz_mode = 'cps_all' THEN
            (COALESCE(agp.promote_anchor_active_pay_amount_1d, 0) + COALESCE(agp.promote_faction_active_pay_amount_1d, 0)) / 0.4
            + COALESCE(agp.promote_download_pay_amount_1d, 0) ELSE 0 END), 0)::numeric AS flow,
          COALESCE(SUM(CASE WHEN agp.biz_mode = 'cps_all' AND agp.promote_scene = 'live' THEN
            (COALESCE(agp.promote_anchor_active_pay_amount_1d, 0) + COALESCE(agp.promote_faction_active_pay_amount_1d, 0)) / 0.4
            + COALESCE(agp.promote_download_pay_amount_1d, 0) ELSE 0 END), 0)::numeric AS live_flow,
          COALESCE(SUM(CASE WHEN agp.biz_mode = 'cps_all' AND agp.promote_scene = 'video' THEN
            (COALESCE(agp.promote_anchor_active_pay_amount_1d, 0) + COALESCE(agp.promote_faction_active_pay_amount_1d, 0)) / 0.4
            + COALESCE(agp.promote_download_pay_amount_1d, 0) ELSE 0 END), 0)::numeric AS video_flow,
          COALESCE(SUM(CASE WHEN agp.biz_mode = 'cps' THEN agp.promote_install_finish_ucnt_1d ELSE 0 END), 0)::numeric AS install_or_activate
        FROM anchor_game_promo_daily agp JOIN anchor_group ag ON ag.anchor_id = agp.anchor_id
        WHERE ag.project = 'ddz' AND ${groupFilter(filters)}
          AND agp.date >= ${dateFrom} AND agp.date <= ${dateTo}
        GROUP BY agp.date ORDER BY agp.date
      `)
    : Promise.resolve([]);

  const miniP = shouldMini
    ? db.execute(sql`
        WITH ${groups}
        SELECT mg.date AS d,
          COALESCE(SUM(mg.before_divided_income), 0)::numeric AS flow,
          COALESCE(SUM(mg.gm_active_ucnt), 0)::numeric AS install_or_activate
        FROM anchor_minigame_daily mg JOIN anchor_group ag ON ag.anchor_id = mg.anchor_id
        WHERE ag.project IN ('three', 'zhaohua') AND ${groupFilter(filters)}
          AND mg.date >= ${dateFrom} AND mg.date <= ${dateTo}
        GROUP BY mg.date ORDER BY mg.date
      `)
    : Promise.resolve([]);

  const profileP = db.execute(sql`
    WITH ${groups}, profile_days AS (
      SELECT TO_CHAR(TO_TIMESTAMP(ap.join_time), 'YYYY-MM-DD') AS d, 1 AS new_count, 0 AS first_live_count
      FROM anchor_profile ap JOIN anchor_group ag ON ag.anchor_id = ap.anchor_id
      WHERE ${groupFilter(filters)} AND ap.join_time IS NOT NULL
        AND ap.join_time >= ${fromUnix} AND ap.join_time <= ${toUnix}
      UNION ALL
      SELECT TO_CHAR(TO_TIMESTAMP(ap.first_live_time_in_faction), 'YYYY-MM-DD') AS d, 0 AS new_count, 1 AS first_live_count
      FROM anchor_profile ap JOIN anchor_group ag ON ag.anchor_id = ap.anchor_id
      WHERE ${groupFilter(filters)} AND ap.first_live_time_in_faction IS NOT NULL
        AND ap.first_live_time_in_faction > 0
        AND ap.first_live_time_in_faction >= ${fromUnix} AND ap.first_live_time_in_faction <= ${toUnix}
    )
    SELECT d, SUM(new_count)::int AS new_anchor_count, SUM(first_live_count)::int AS first_live_anchor_count
    FROM profile_days GROUP BY d ORDER BY d
  `);

  const portraitP = db.execute(sql`
    WITH ${groups}
    SELECT pd.date AS d, COALESCE(SUM(pd.show_uv), 0)::numeric AS show_uv,
      COALESCE(SUM(pd.watch_uv), 0)::numeric AS watch_uv
    FROM anchor_portrait_daily pd JOIN anchor_group ag ON ag.anchor_id = pd.anchor_id
    WHERE ${groupFilter(filters)} AND pd.date >= ${dateFrom} AND pd.date <= ${dateTo}
    GROUP BY pd.date ORDER BY pd.date
  `);

  const [adailyR, gameR, miniR, profileR, portraitR] = await Promise.all([
    adailyP,
    gamePromoP,
    miniP,
    profileP,
    portraitP,
  ]);
  type Row = Record<string, unknown>;
  const map = (rows: unknown, key: string): Map<string, number> => {
    const out = new Map<string, number>();
    (rows as Row[]).forEach((r) => out.set(String(r.d), Number(r[key] ?? r.v ?? 0)));
    return out;
  };
  const union = (a: Map<string, number>, b: Map<string, number>): Map<string, number> => {
    const out = new Map(a);
    for (const [d, value] of b) out.set(d, (out.get(d) ?? 0) + value);
    return out;
  };
  const adailyRows = adailyR as Row[];
  const totalFanTicketMap = map(adailyRows, "total_fan_ticket");
  const activeMap = map(adailyRows, "active_anchor_count");
  const gameFlow = map(gameR, "flow");
  const miniFlow = map(miniR, "flow");
  const gameLive = map(gameR, "live_flow");
  const gameVideo = map(gameR, "video_flow");
  const miniActive = map(miniR, "install_or_activate");
  const flowMap =
    filters.project === "ddz" ? gameFlow : filters.project ? miniFlow : union(gameFlow, miniFlow);
  const liveFlowMap =
    filters.project === "ddz" ? gameLive : filters.project ? miniFlow : union(gameLive, miniFlow);
  const videoFlowMap = filters.project
    ? filters.project === "ddz"
      ? gameVideo
      : new Map()
    : gameVideo;
  const installMap =
    filters.project === "ddz"
      ? map(gameR, "install_or_activate")
      : filters.project
        ? miniActive
        : union(map(gameR, "install_or_activate"), miniActive);
  return new Map<DrawerMetric, Map<string, number>>([
    ["total_fan_ticket", totalFanTicketMap],
    ["flow", flowMap],
    ["active_anchor_count", activeMap],
    ["new_anchor_count", map(profileR, "new_anchor_count")],
    ["first_live_anchor_count", map(profileR, "first_live_anchor_count")],
    ["live_flow", liveFlowMap],
    ["video_flow", videoFlowMap],
    ["install_or_activate", installMap],
    ["show_uv", map(portraitR, "show_uv")],
    ["watch_uv", map(portraitR, "watch_uv")],
  ]);
}

/** 把 daily map 拉成连续日期的 DrawerDailyRow[] */
function buildDailyRows(
  matrix: Map<DrawerMetric, Map<string, number>>,
  dateFrom: string,
  dateTo: string,
  notApplicable: Set<DrawerMetric>,
): DrawerDailyRow[] {
  const rows: DrawerDailyRow[] = [];
  const start = new Date(dateFrom + "T00:00:00");
  const end = new Date(dateTo + "T00:00:00");
  const days = Math.round((end.getTime() - start.getTime()) / 86400_000) + 1;
  const metrics: DrawerMetric[] = [
    "total_fan_ticket",
    "flow",
    "active_anchor_count",
    "new_anchor_count",
    "first_live_anchor_count",
    "live_flow",
    "video_flow",
    "install_or_activate",
    "show_uv",
    "watch_uv",
  ];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86400_000);
    const ds = toLocalIsoDate(d);
    const values: Partial<Record<DrawerMetric, number | null>> = {};
    for (const m of metrics) {
      if (notApplicable.has(m)) {
        values[m] = null;
        continue;
      }
      values[m] = matrix.get(m)?.get(ds) ?? 0;
    }
    rows.push({ date: ds, values });
  }
  return rows;
}

/** 把日明细汇总成单 metric 的总值（active_anchor_count 用 distinct max-of-day 兜底；其余 sum） */
function aggregateMetric(
  metric: DrawerMetric,
  rows: DrawerDailyRow[],
  notApplicable: Set<DrawerMetric>,
): number {
  if (notApplicable.has(metric)) return 0;
  // active_anchor_count 是「每日的不同主播数」，跨日不能简单 sum；这里取「每日最大」作为近似（TODO：精确口径需 distinct over date range）
  // 但 KPI 这里如果 sum 会重复，取 max 更合理。
  if (metric === "active_anchor_count") {
    let m = 0;
    for (const r of rows) {
      const v = r.values[metric];
      if (typeof v === "number" && v > m) m = v;
    }
    return m;
  }
  let s = 0;
  for (const r of rows) {
    const v = r.values[metric];
    if (typeof v === "number") s += v;
  }
  return s;
}

/**
 * 「达成主播列表」单 metric 排序聚合。
 *
 * 复用 anchor_group CTE 做 (project, group) 过滤；不同 metric 走不同 SQL：
 *
 * - first_live_anchor_count → JOIN anchor_profile，按 first_live_time_in_faction 降序，全量返回
 * - new_anchor_count        → JOIN anchor_profile，按 join_time 降序，全量返回
 * - active_anchor_count     → 按开播天数（COUNT(date) WHERE live_duration_1d > 0）降序，Top 20
 * - total_fan_ticket        → 按 SUM(total_fan_ticket) 降序，Top 20
 * - flow / live_flow / video_flow → 项目分支聚合（CPS 项目=cps_all、scene=live/video；three=minigame），Top 20
 * - install_or_activate     → 项目分支（CPS 项目=install_finish；three=gm_active），Top 20
 * - show_uv / watch_uv      → SUM(portrait.{col})，Top 20
 *
 * 总数（total_anchors）：count of anchors with metric_value > 0（在筛选 + 周期内）
 */
async function fetchTopAnchors(
  filters: DrawerDetailFilters,
  metric: DrawerMetric,
  groups: SQL,
): Promise<{ rows: DrawerTopAnchor[]; total: number }> {
  const { date_from: dateFrom, date_to: dateTo } = filters;
  const fromUnix = Math.floor(new Date(dateFrom + "T00:00:00").getTime() / 1000);
  const toUnix = Math.floor(new Date(dateTo + "T23:59:59").getTime() / 1000);

  // 三国 + video_flow 不适用 — 直接返回空列表
  if (filters.project === "three" && metric === "video_flow") {
    return { rows: [], total: 0 };
  }

  // 公共 anchor 信息 SELECT 片段
  const profileFields = sql`ap.anchor_id, ap.nick_name, ap.avatar, ap.aweme_display_id, ap.broker_name`;

  /**
   * SQL 模板：
   *   WITH anchor_group AS (...)
   *   SELECT <fields>, <metric_value>, <display_date>
   *   FROM <data table>
   *   JOIN anchor_group ag ON ...
   *   JOIN anchor_profile ap ON ap.anchor_id = ag.anchor_id
   *   WHERE <groupFilter> AND <date range> AND <metric > 0>
   *   GROUP BY ap.anchor_id ...
   *   ORDER BY metric_value DESC
   *   LIMIT N
   */

  // ─── first_live_anchor_count（全量，按首播时间降序）─────────────────────────
  if (metric === "first_live_anchor_count") {
    const rs = await db.execute(sql`
      WITH ${groups}
      SELECT ${profileFields},
        ap.first_live_time_in_faction::numeric AS metric_value,
        TO_CHAR(TO_TIMESTAMP(ap.first_live_time_in_faction), 'YYYY-MM-DD') AS display_date
      FROM anchor_profile ap
      JOIN anchor_group ag ON ag.anchor_id = ap.anchor_id
      WHERE ${groupFilter(filters)}
        AND ap.first_live_time_in_faction IS NOT NULL
        AND ap.first_live_time_in_faction > 0
        AND ap.first_live_time_in_faction >= ${fromUnix}
        AND ap.first_live_time_in_faction <= ${toUnix}
      ORDER BY ap.first_live_time_in_faction DESC
    `);
    const rows = mapTopAnchorRows(rs);
    return { rows, total: rows.length };
  }

  // ─── new_anchor_count（全量，按入会时间降序）────────────────────────────────
  if (metric === "new_anchor_count") {
    const rs = await db.execute(sql`
      WITH ${groups}
      SELECT ${profileFields},
        ap.join_time::numeric AS metric_value,
        TO_CHAR(TO_TIMESTAMP(ap.join_time), 'YYYY-MM-DD') AS display_date
      FROM anchor_profile ap
      JOIN anchor_group ag ON ag.anchor_id = ap.anchor_id
      WHERE ${groupFilter(filters)}
        AND ap.join_time IS NOT NULL
        AND ap.join_time >= ${fromUnix} AND ap.join_time <= ${toUnix}
      ORDER BY ap.join_time DESC
    `);
    const rows = mapTopAnchorRows(rs);
    return { rows, total: rows.length };
  }

  // ─── active_anchor_count（按开播天数 = COUNT distinct date 降序，Top 20）────
  if (metric === "active_anchor_count") {
    const rs = await db.execute(sql`
      WITH ${groups}
      SELECT ${profileFields},
        COUNT(DISTINCT ad.date)::numeric AS metric_value
      FROM anchor_daily ad
      JOIN anchor_group ag ON ag.anchor_id = ad.anchor_id
      JOIN anchor_profile ap ON ap.anchor_id = ag.anchor_id
      WHERE ${groupFilter(filters)}
        AND ad.date >= ${dateFrom} AND ad.date <= ${dateTo}
        AND ad.live_duration_1d > 0
      GROUP BY ap.anchor_id, ap.nick_name, ap.avatar, ap.aweme_display_id, ap.broker_name
      ORDER BY metric_value DESC
      LIMIT 20
    `);
    return { rows: mapTopAnchorRows(rs), total: await countActiveTotal(filters, groups) };
  }

  // ─── total_fan_ticket（音浪：anchor_daily 通用）────────────────────────────
  if (metric === "total_fan_ticket") {
    const rs = await db.execute(sql`
      WITH ${groups}
      SELECT ${profileFields},
        COALESCE(SUM(ad.total_fan_ticket), 0)::numeric AS metric_value
      FROM anchor_daily ad
      JOIN anchor_group ag ON ag.anchor_id = ad.anchor_id
      JOIN anchor_profile ap ON ap.anchor_id = ag.anchor_id
      WHERE ${groupFilter(filters)}
        AND ad.date >= ${dateFrom} AND ad.date <= ${dateTo}
      GROUP BY ap.anchor_id, ap.nick_name, ap.avatar, ap.aweme_display_id, ap.broker_name
      HAVING COALESCE(SUM(ad.total_fan_ticket), 0) > 0
      ORDER BY metric_value DESC
      LIMIT 20
    `);
    return { rows: mapTopAnchorRows(rs), total: await countTotalFanTicketTotal(filters, groups) };
  }

  // ─── show_uv / watch_uv（anchor_portrait_daily 通用）──────────────────────
  if (metric === "show_uv" || metric === "watch_uv") {
    const col = metric === "show_uv" ? sql`pd.show_uv` : sql`pd.watch_uv`;
    const rs = await db.execute(sql`
      WITH ${groups}
      SELECT ${profileFields},
        COALESCE(SUM(${col}), 0)::numeric AS metric_value
      FROM anchor_portrait_daily pd
      JOIN anchor_group ag ON ag.anchor_id = pd.anchor_id
      JOIN anchor_profile ap ON ap.anchor_id = ag.anchor_id
      WHERE ${groupFilter(filters)}
        AND pd.date >= ${dateFrom} AND pd.date <= ${dateTo}
      GROUP BY ap.anchor_id, ap.nick_name, ap.avatar, ap.aweme_display_id, ap.broker_name
      HAVING COALESCE(SUM(${col}), 0) > 0
      ORDER BY metric_value DESC
      LIMIT 20
    `);
    return { rows: mapTopAnchorRows(rs), total: await countPortraitTotal(filters, metric, groups) };
  }

  // ─── flow / live_flow / video_flow / install_or_activate ─────────────────
  // 项目分支：斗地主/造化仙府用 anchor_game_promo_daily / 三国用 anchor_minigame_daily
  if (
    metric === "flow" ||
    metric === "live_flow" ||
    metric === "video_flow" ||
    metric === "install_or_activate"
  ) {
    return await fetchTopAnchorsProjectBranched(filters, metric, groups);
  }

  return { rows: [], total: 0 };
}

/** 通用 row mapper */
function mapTopAnchorRows(result: unknown): DrawerTopAnchor[] {
  const rows = result as unknown as Record<string, unknown>[];
  return rows.map((r) => ({
    anchor_id: String(r.anchor_id),
    nick_name: String(r.nick_name ?? ""),
    avatar: r.avatar ? String(r.avatar) : null,
    aweme_display_id: r.aweme_display_id ? String(r.aweme_display_id) : null,
    broker_name: r.broker_name ? String(r.broker_name) : null,
    metric_value: Number(r.metric_value ?? 0),
    display_date: r.display_date ? String(r.display_date) : undefined,
  }));
}

/** active_anchor_count 总数：DISTINCT anchor_id WHERE live_duration_1d > 0 */
async function countActiveTotal(filters: DrawerDetailFilters, groups: SQL): Promise<number> {
  const { date_from: dateFrom, date_to: dateTo } = filters;
  const r = await db.execute(sql`
    WITH ${groups}
    SELECT COUNT(DISTINCT ad.anchor_id)::int AS c
    FROM anchor_daily ad
    JOIN anchor_group ag ON ag.anchor_id = ad.anchor_id
    WHERE ${groupFilter(filters)}
      AND ad.date >= ${dateFrom} AND ad.date <= ${dateTo}
      AND ad.live_duration_1d > 0
  `);
  return Number((r as unknown as Record<string, unknown>[])[0]?.c ?? 0);
}

/** total_fan_ticket 总数：达成（>0）的主播数 */
async function countTotalFanTicketTotal(
  filters: DrawerDetailFilters,
  groups: SQL,
): Promise<number> {
  const { date_from: dateFrom, date_to: dateTo } = filters;
  const r = await db.execute(sql`
    WITH ${groups},
    per_anchor AS (
      SELECT ad.anchor_id, COALESCE(SUM(ad.total_fan_ticket), 0) AS v
      FROM anchor_daily ad
      JOIN anchor_group ag ON ag.anchor_id = ad.anchor_id
      WHERE ${groupFilter(filters)}
        AND ad.date >= ${dateFrom} AND ad.date <= ${dateTo}
      GROUP BY ad.anchor_id
    )
    SELECT COUNT(*)::int AS c FROM per_anchor WHERE v > 0
  `);
  return Number((r as unknown as Record<string, unknown>[])[0]?.c ?? 0);
}

/** show_uv / watch_uv 总数：达成（>0）的主播数 */
async function countPortraitTotal(
  filters: DrawerDetailFilters,
  metric: "show_uv" | "watch_uv",
  groups: SQL,
): Promise<number> {
  const { date_from: dateFrom, date_to: dateTo } = filters;
  const col = metric === "show_uv" ? sql`pd.show_uv` : sql`pd.watch_uv`;
  const r = await db.execute(sql`
    WITH ${groups},
    per_anchor AS (
      SELECT pd.anchor_id, COALESCE(SUM(${col}), 0) AS v
      FROM anchor_portrait_daily pd
      JOIN anchor_group ag ON ag.anchor_id = pd.anchor_id
      WHERE ${groupFilter(filters)}
        AND pd.date >= ${dateFrom} AND pd.date <= ${dateTo}
      GROUP BY pd.anchor_id
    )
    SELECT COUNT(*)::int AS c FROM per_anchor WHERE v > 0
  `);
  return Number((r as unknown as Record<string, unknown>[])[0]?.c ?? 0);
}

/**
 * flow / live_flow / video_flow / install_or_activate 的项目分支聚合。
 *
 * 单项目（filters.project 限定）→ 直接走对应分支；
 * 跨项目 → 跑 CPS + three 分支再 UNION 后聚合（per anchor sum），全集排序 Top 20。
 */
async function fetchTopAnchorsProjectBranched(
  filters: DrawerDetailFilters,
  metric: "flow" | "live_flow" | "video_flow" | "install_or_activate",
  groups: SQL,
): Promise<{ rows: DrawerTopAnchor[]; total: number }> {
  const { date_from: dateFrom, date_to: dateTo } = filters;

  // CPS 项目分支 SQL 片段（计算 per-anchor metric_value）
  function gamePromoPart(): SQL {
    if (metric === "flow") {
      return sql`
        SELECT agp.anchor_id,
          SUM(
            (COALESCE(agp.promote_anchor_active_pay_amount_1d, 0) + COALESCE(agp.promote_faction_active_pay_amount_1d, 0)) / 0.4
            + COALESCE(agp.promote_download_pay_amount_1d, 0)
          )::numeric AS v
        FROM anchor_game_promo_daily agp
        JOIN anchor_group ag ON ag.anchor_id = agp.anchor_id
        WHERE ag.project = 'ddz' AND ${groupFilter(filters)}
          AND agp.biz_mode = 'cps_all'
          AND agp.date >= ${dateFrom} AND agp.date <= ${dateTo}
        GROUP BY agp.anchor_id
      `;
    }
    if (metric === "live_flow" || metric === "video_flow") {
      const scene = metric === "live_flow" ? "live" : "video";
      return sql`
        SELECT agp.anchor_id,
          SUM(
            (COALESCE(agp.promote_anchor_active_pay_amount_1d, 0) + COALESCE(agp.promote_faction_active_pay_amount_1d, 0)) / 0.4
            + COALESCE(agp.promote_download_pay_amount_1d, 0)
          )::numeric AS v
        FROM anchor_game_promo_daily agp
        JOIN anchor_group ag ON ag.anchor_id = agp.anchor_id
        WHERE ag.project = 'ddz' AND ${groupFilter(filters)}
          AND agp.biz_mode = 'cps_all' AND agp.promote_scene = ${scene}
          AND agp.date >= ${dateFrom} AND agp.date <= ${dateTo}
        GROUP BY agp.anchor_id
      `;
    }
    // install_or_activate（CPS 项目）= cps install_finish
    return sql`
      SELECT agp.anchor_id,
        COALESCE(SUM(agp.promote_install_finish_ucnt_1d), 0)::numeric AS v
      FROM anchor_game_promo_daily agp
      JOIN anchor_group ag ON ag.anchor_id = agp.anchor_id
      WHERE ag.project = 'ddz' AND ${groupFilter(filters)}
        AND agp.biz_mode = 'cps'
        AND agp.date >= ${dateFrom} AND agp.date <= ${dateTo}
      GROUP BY agp.anchor_id
    `;
  }

  // three 分支 SQL 片段（仅 flow / live_flow / install_or_activate；video_flow 在 three 上不适用，前面已早返回）
  function threePart(): SQL | null {
    if (metric === "video_flow") return null;
    if (metric === "install_or_activate") {
      return sql`
        SELECT mg.anchor_id,
          COALESCE(SUM(mg.gm_active_ucnt), 0)::numeric AS v
        FROM anchor_minigame_daily mg
        JOIN anchor_group ag ON ag.anchor_id = mg.anchor_id
        WHERE ag.project IN ('three', 'zhaohua') AND ${groupFilter(filters)}
          AND mg.date >= ${dateFrom} AND mg.date <= ${dateTo}
        GROUP BY mg.anchor_id
      `;
    }
    // flow / live_flow（三国 video_flow 已 return null）
    return sql`
      SELECT mg.anchor_id,
        SUM(mg.before_divided_income)::numeric AS v
      FROM anchor_minigame_daily mg
      JOIN anchor_group ag ON ag.anchor_id = mg.anchor_id
      WHERE ag.project IN ('three', 'zhaohua') AND ${groupFilter(filters)}
        AND mg.date >= ${dateFrom} AND mg.date <= ${dateTo}
      GROUP BY mg.anchor_id
    `;
  }

  // 选择哪些分支参与 union（按 filters.project 限制）
  const parts: SQL[] = [];
  if (filters.project !== "three" && filters.project !== "zhaohua") parts.push(gamePromoPart());
  if (!filters.project || filters.project === "three" || filters.project === "zhaohua") {
    const tp = threePart();
    if (tp) parts.push(tp);
  }
  if (parts.length === 0) return { rows: [], total: 0 };

  const unionSql = sql.join(parts, sql` UNION ALL `);

  // 主查询：合并 per-anchor 后排序
  const rs = await db.execute(sql`
    WITH ${groups},
    per_anchor AS (
      SELECT anchor_id, SUM(v)::numeric AS metric_value
      FROM (${unionSql}) u
      GROUP BY anchor_id
    )
    SELECT pa.anchor_id, ap.nick_name, ap.avatar, ap.aweme_display_id, ap.broker_name,
      pa.metric_value
    FROM per_anchor pa
    JOIN anchor_profile ap ON ap.anchor_id = pa.anchor_id
    WHERE pa.metric_value > 0
    ORDER BY pa.metric_value DESC
    LIMIT 20
  `);

  const totalR = await db.execute(sql`
    WITH ${groups},
    per_anchor AS (
      SELECT anchor_id, SUM(v)::numeric AS metric_value
      FROM (${unionSql}) u
      GROUP BY anchor_id
    )
    SELECT COUNT(*)::int AS c FROM per_anchor WHERE metric_value > 0
  `);
  const total = Number((totalR as unknown as Record<string, unknown>[])[0]?.c ?? 0);

  return { rows: mapTopAnchorRows(rs), total };
}

/**
 * 抽屉详情：title + 9 KPI + 当前 daily_rows + 前周期 prev_daily_rows + 当前 metric 的 top_anchors
 */
export async function getDrawerDetail(
  filters: DrawerDetailFilters,
  scope: DashboardScope,
): Promise<DrawerDetailResponse> {
  const { date_from: dateFrom, date_to: dateTo } = filters;
  const days =
    Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400_000) + 1;
  const prevFrom = shiftDate(dateFrom, -days);
  const prevTo = shiftDate(dateTo, -days);

  const metric: DrawerMetric = filters.metric ?? "total_fan_ticket";

  if (scope.kind === "reject") {
    return {
      title: buildTitle(filters),
      kpis: [],
      daily_rows: [],
      prev_daily_rows: [],
      top_anchors: [],
      total_anchors: 0,
    };
  }

  // Resolve scoped project attribution once. Each matrix/list/count query reuses
  // these request-local rows instead of rescanning historical game records.
  const groups = await resolveAnchorGroup(scope);
  const [curMatrix, prevMatrix, topAnchorsResult] = await Promise.all([
    fetchDailyMatrix(filters, dateFrom, dateTo, groups),
    fetchDailyMatrix(filters, prevFrom, prevTo, groups),
    fetchTopAnchors(filters, metric, groups),
  ]);

  // 哪些 metric 不适用（依据 filters.project）
  const notApplicable = new Set<DrawerMetric>();
  if (filters.project === "three") {
    notApplicable.add("video_flow");
  }

  const dailyRows = buildDailyRows(curMatrix, dateFrom, dateTo, notApplicable);
  const prevDailyRows = buildDailyRows(prevMatrix, prevFrom, prevTo, notApplicable);

  // 10 KPI（顺序：5 Section 1 + 5 Section 2）
  const kpiSpec: { key: DrawerMetric; label: string; unit?: string }[] = [
    { key: "total_fan_ticket", label: "音浪" },
    { key: "flow", label: "流水" },
    { key: "active_anchor_count", label: "开播主播", unit: "人" },
    { key: "new_anchor_count", label: "新入驻", unit: "人" },
    { key: "first_live_anchor_count", label: "首次开播", unit: "人" },
    { key: "live_flow", label: "直播流水" },
    { key: "video_flow", label: "短视频流水" },
    {
      key: "install_or_activate",
      // 在 CPS 项目上下文显示「安装」，在 three 上下文显示「激活」，跨项目时显示「安装/激活」
      label: filters.project === "ddz" ? "安装" : filters.project ? "激活" : "安装/激活",
      unit: "人",
    },
    { key: "show_uv", label: "曝光人数", unit: "人" },
    { key: "watch_uv", label: "进直播间UV", unit: "人" },
  ];

  const kpis: DrawerKpiBlock[] = kpiSpec.map((spec) => {
    const isNa = notApplicable.has(spec.key);
    if (isNa) {
      return {
        key: spec.key,
        label: spec.label,
        value: 0,
        unit: spec.unit,
        vs_prev: null,
        not_applicable: true,
      };
    }
    const cur = aggregateMetric(spec.key, dailyRows, notApplicable);
    const prev = aggregateMetric(spec.key, prevDailyRows, notApplicable);
    const vsPrev = prev > 0 ? ((cur - prev) / prev) * 100 : null;
    return {
      key: spec.key,
      label: spec.label,
      value: cur,
      unit: spec.unit,
      vs_prev: vsPrev,
    };
  });

  return {
    title: buildTitle(filters),
    kpis,
    daily_rows: dailyRows,
    prev_daily_rows: prevDailyRows,
    top_anchors: topAnchorsResult.rows,
    total_anchors: topAnchorsResult.total,
  };
}

/** 指标切换只需要重新计算主播排行，避免重复加载全部日明细和前周期数据。 */
export async function getDrawerTopAnchors(
  filters: DrawerDetailFilters,
  scope: DashboardScope,
): Promise<Pick<DrawerDetailResponse, "top_anchors" | "total_anchors">> {
  if (scope.kind === "reject") return { top_anchors: [], total_anchors: 0 };
  const groups = await resolveAnchorGroup(scope);
  const result = await fetchTopAnchors(filters, filters.metric ?? "total_fan_ticket", groups);
  return { top_anchors: result.rows, total_anchors: result.total };
}
