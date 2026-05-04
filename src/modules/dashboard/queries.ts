import "server-only";
import { db } from "@/db/client";
import { sql, type SQL } from "drizzle-orm";
import type {
  CoreKpiResponse,
  DashboardOverviewResponse,
  DrawerDailyRow,
  DrawerDetailFilters,
  DrawerDetailResponse,
  DrawerKpiBlock,
  DrawerMetric,
  ProjectBreakdown,
  Section2Metric,
} from "./types";

/**
 * Dashboard 核心 SQL：每个 anchor 映射到 (project, group)
 *
 * 项目（is_threekingdoms）：true → three / false → ddz
 * 分组（broker_name → dingtalk_user → dept → entity_alias.alias）：
 *   - "线上运营" → online
 *   - "线下运营" → offline
 *   - "捕鱼运营" → other（不在斗地主/三国看板单独展示）
 *   - broker_name = "线上主播" → online（兜底）
 *   - 其他匹配不上 → other
 */
function anchorGroupCte(): SQL {
  return sql`
    anchor_group AS (
      SELECT
        ap.anchor_id,
        ap.is_threekingdoms,
        CASE WHEN ap.is_threekingdoms THEN 'three' ELSE 'ddz' END AS project,
        CASE
          WHEN ea.alias = '线上运营' THEN 'online'
          WHEN ea.alias = '线下运营' THEN 'offline'
          WHEN ap.broker_name = '线上主播' THEN 'online'
          ELSE 'other'
        END AS "group"
      FROM anchor_profile ap
      LEFT JOIN dingtalk_user du ON du.name = ap.broker_name
      LEFT JOIN entity_alias ea
        ON ea.entity_type = 'dept' AND ea.entity_id = du.dept_ids->>0
      WHERE ap.is_archived = FALSE
    )
  `;
}

function shiftDate(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/* ──────────────────── Section 1（不动） ──────────────────── */

/** Section 1 单个周期的 4 KPI */
async function fetchCorePeriod(
  dateFrom: string,
  dateTo: string,
): Promise<{
  total_fan_ticket: number;
  flow: number;
  active_anchor_count: number;
  new_anchor_count: number;
}> {
  const fromUnix = Math.floor(new Date(dateFrom + "T00:00:00").getTime() / 1000);
  const toUnix = Math.floor(new Date(dateTo + "T23:59:59").getTime() / 1000);

  const result = await db.execute(sql`
    WITH daily_sum AS (
      SELECT
        COALESCE(SUM(total_fan_ticket), 0)::numeric AS total_fan_ticket,
        COUNT(DISTINCT anchor_id) FILTER (WHERE live_duration_1d > 0) AS active_anchor_count
      FROM anchor_daily
      WHERE date >= ${dateFrom} AND date <= ${dateTo}
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
            AND agp.biz_mode = 'cps_all'
            AND agp.date >= ${dateFrom} AND agp.date <= ${dateTo}
        ), 0)::numeric +
        COALESCE((
          SELECT SUM(mg.before_divided_income)
          FROM anchor_minigame_daily mg
          JOIN anchor_profile ap ON ap.anchor_id = mg.anchor_id
          WHERE ap.is_threekingdoms = TRUE
            AND mg.date >= ${dateFrom} AND mg.date <= ${dateTo}
        ), 0)::numeric AS flow
    ),
    new_anchor AS (
      SELECT COUNT(*) AS new_anchor_count
      FROM anchor_profile
      WHERE is_archived = FALSE
        AND join_time IS NOT NULL
        AND join_time >= ${fromUnix} AND join_time <= ${toUnix}
    )
    SELECT
      ds.total_fan_ticket, ds.active_anchor_count,
      fs.flow, na.new_anchor_count
    FROM daily_sum ds, flow_sum fs, new_anchor na
  `);

  const row = (result as unknown as Record<string, unknown>[])[0];
  return {
    total_fan_ticket: Number(row?.total_fan_ticket ?? 0),
    flow: Number(row?.flow ?? 0),
    active_anchor_count: Number(row?.active_anchor_count ?? 0),
    new_anchor_count: Number(row?.new_anchor_count ?? 0),
  };
}

export async function getCoreKpis(dateFrom: string, dateTo: string): Promise<CoreKpiResponse> {
  const days =
    Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400_000) + 1;

  const prevDayFrom = shiftDate(dateFrom, -days);
  const prevDayTo = shiftDate(dateTo, -days);
  const prevWeekFrom = shiftDate(dateFrom, -7);
  const prevWeekTo = shiftDate(dateTo, -7);

  const [current, prevDay, prevWeek] = await Promise.all([
    fetchCorePeriod(dateFrom, dateTo),
    fetchCorePeriod(prevDayFrom, prevDayTo),
    fetchCorePeriod(prevWeekFrom, prevWeekTo),
  ]);

  return {
    total_fan_ticket: {
      current: current.total_fan_ticket,
      prev_day: prevDay.total_fan_ticket,
      prev_week: prevWeek.total_fan_ticket,
    },
    flow: {
      current: current.flow,
      prev_day: prevDay.flow,
      prev_week: prevWeek.flow,
    },
    active_anchor_count: {
      current: current.active_anchor_count,
      prev_day: prevDay.active_anchor_count,
      prev_week: prevWeek.active_anchor_count,
    },
    new_anchor_count: {
      current: current.new_anchor_count,
      prev_day: prevDay.new_anchor_count,
      prev_week: prevWeek.new_anchor_count,
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
): Promise<
  {
    project: "ddz" | "three";
    group: "online" | "offline" | "other";
    value: number;
    anchor_count: number;
  }[]
> {
  // ─── show_uv / watch_uv：anchor_portrait_daily 通用 ──────────────
  if (metric === "show_uv" || metric === "watch_uv") {
    const col = metric === "show_uv" ? sql`pd.show_uv` : sql`pd.watch_uv`;
    const result = await db.execute(sql`
      WITH ${anchorGroupCte()}
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
      project: String(r.project) as "ddz" | "three",
      group: String(r.group) as "online" | "offline" | "other",
      value: Number(r.value ?? 0),
      anchor_count: Number(r.anchor_count ?? 0),
    }));
  }

  // ─── live_flow / video_flow：斗地主用 game_promo cps_all + scene；三国 live_flow 用 minigame；三国 video_flow = 0 ─
  if (metric === "live_flow" || metric === "video_flow") {
    const scene = metric === "live_flow" ? "live" : "video";
    // 斗地主分支：cps_all + promote_scene 限定
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
    // 三国分支：仅 live_flow 有数据
    const threePart =
      metric === "live_flow"
        ? sql`,
      three_part AS (
        SELECT ag.project, ag."group",
          SUM(mg.before_divided_income)::numeric AS value,
          COUNT(DISTINCT ag.anchor_id)::int AS anchor_count
        FROM anchor_minigame_daily mg
        JOIN anchor_group ag ON ag.anchor_id = mg.anchor_id
        WHERE ag.project = 'three'
          AND mg.date >= ${dateFrom} AND mg.date <= ${dateTo}
        GROUP BY ag.project, ag."group"
      )
      SELECT * FROM ddz_part UNION ALL SELECT * FROM three_part
    `
        : sql`
      SELECT * FROM ddz_part
    `;
    const result = await db.execute(sql`
      WITH ${anchorGroupCte()},
      ${ddzPart}${threePart}
    `);
    const rows = result as unknown as Record<string, unknown>[];
    return rows.map((r) => ({
      project: String(r.project) as "ddz" | "three",
      group: String(r.group) as "online" | "offline" | "other",
      value: Number(r.value ?? 0),
      anchor_count: Number(r.anchor_count ?? 0),
    }));
  }

  // ─── install_or_activate：斗地主 = cps install_finish；三国 = minigame gm_active_ucnt ─
  if (metric === "install_or_activate") {
    const result = await db.execute(sql`
      WITH ${anchorGroupCte()},
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
        WHERE ag.project = 'three'
          AND mg.date >= ${dateFrom} AND mg.date <= ${dateTo}
        GROUP BY ag.project, ag."group"
      )
      SELECT * FROM ddz_part UNION ALL SELECT * FROM three_part
    `);
    const rows = result as unknown as Record<string, unknown>[];
    return rows.map((r) => ({
      project: String(r.project) as "ddz" | "three",
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
  project: "ddz" | "three",
  group: "online" | "offline" | "other",
  dateFrom: string,
  dateTo: string,
): Promise<number[]> {
  // 三国 + video_flow → 不适用
  if (project === "three" && metric === "video_flow") return [];

  if (metric === "show_uv" || metric === "watch_uv") {
    const col = metric === "show_uv" ? sql`pd.show_uv` : sql`pd.watch_uv`;
    const result = await db.execute(sql`
      WITH ${anchorGroupCte()}
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
        WITH ${anchorGroupCte()}
        SELECT agp.date AS d,
          COALESCE(SUM(
            (COALESCE(agp.promote_anchor_active_pay_amount_1d, 0) + COALESCE(agp.promote_faction_active_pay_amount_1d, 0)) / 0.4
            + COALESCE(agp.promote_download_pay_amount_1d, 0)
          ), 0)::numeric AS v
        FROM anchor_game_promo_daily agp
        JOIN anchor_group ag ON ag.anchor_id = agp.anchor_id
        WHERE ag.project = 'ddz' AND ag."group" = ${group}
          AND agp.biz_mode = 'cps_all' AND agp.promote_scene = ${scene}
          AND agp.date >= ${dateFrom} AND agp.date <= ${dateTo}
        GROUP BY agp.date ORDER BY agp.date
      `);
      return (result as unknown as Record<string, unknown>[]).map((r) => Number(r.v ?? 0));
    }
    // three + live_flow
    const result = await db.execute(sql`
      WITH ${anchorGroupCte()}
      SELECT mg.date AS d, COALESCE(SUM(mg.before_divided_income), 0)::numeric AS v
      FROM anchor_minigame_daily mg
      JOIN anchor_group ag ON ag.anchor_id = mg.anchor_id
      WHERE ag.project = 'three' AND ag."group" = ${group}
        AND mg.date >= ${dateFrom} AND mg.date <= ${dateTo}
      GROUP BY mg.date ORDER BY mg.date
    `);
    return (result as unknown as Record<string, unknown>[]).map((r) => Number(r.v ?? 0));
  }

  if (metric === "install_or_activate") {
    if (project === "ddz") {
      const result = await db.execute(sql`
        WITH ${anchorGroupCte()}
        SELECT agp.date AS d,
          COALESCE(SUM(agp.promote_install_finish_ucnt_1d), 0)::numeric AS v
        FROM anchor_game_promo_daily agp
        JOIN anchor_group ag ON ag.anchor_id = agp.anchor_id
        WHERE ag.project = 'ddz' AND ag."group" = ${group}
          AND agp.biz_mode = 'cps'
          AND agp.date >= ${dateFrom} AND agp.date <= ${dateTo}
        GROUP BY agp.date ORDER BY agp.date
      `);
      return (result as unknown as Record<string, unknown>[]).map((r) => Number(r.v ?? 0));
    }
    const result = await db.execute(sql`
      WITH ${anchorGroupCte()}
      SELECT mg.date AS d, COALESCE(SUM(mg.gm_active_ucnt), 0)::numeric AS v
      FROM anchor_minigame_daily mg
      JOIN anchor_group ag ON ag.anchor_id = mg.anchor_id
      WHERE ag.project = 'three' AND ag."group" = ${group}
        AND mg.date >= ${dateFrom} AND mg.date <= ${dateTo}
      GROUP BY mg.date ORDER BY mg.date
    `);
    return (result as unknown as Record<string, unknown>[]).map((r) => Number(r.v ?? 0));
  }

  return [];
}

export async function getSection2Breakdown(
  metric: Section2Metric,
  dateFrom: string,
  dateTo: string,
): Promise<{ ddz: ProjectBreakdown; three: ProjectBreakdown }> {
  const days =
    Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400_000) + 1;
  const prevFrom = shiftDate(dateFrom, -days);
  const prevTo = shiftDate(dateTo, -days);

  const [current, prev] = await Promise.all([
    fetchGroupBreakdown(metric, dateFrom, dateTo),
    fetchGroupBreakdown(metric, prevFrom, prevTo),
  ]);

  const map = new Map<string, { value: number; anchor_count: number }>();
  current.forEach((r) =>
    map.set(`${r.project}:${r.group}`, { value: r.value, anchor_count: r.anchor_count }),
  );
  const prevMap = new Map<string, number>();
  prev.forEach((r) => prevMap.set(`${r.project}:${r.group}`, r.value));

  // sparklines（6 个 cell × N 天）
  const sparklineKeys: ["ddz" | "three", "online" | "offline" | "other"][] = [
    ["ddz", "online"],
    ["ddz", "offline"],
    ["ddz", "other"],
    ["three", "online"],
    ["three", "offline"],
    ["three", "other"],
  ];
  const sparklines = await Promise.all(
    sparklineKeys.map(([p, g]) => fetchSparkline(metric, p, g, dateFrom, dateTo)),
  );
  const sparkMap = new Map<string, number[]>();
  sparklineKeys.forEach(([p, g], i) => sparkMap.set(`${p}:${g}`, sparklines[i] ?? []));

  function isNotApplicable(project: "ddz" | "three"): boolean {
    return project === "three" && metric === "video_flow";
  }

  function buildCell(
    project: "ddz" | "three",
    group: "online" | "offline" | "other",
  ): ProjectBreakdown["online"] {
    const notApplicable = isNotApplicable(project);
    if (notApplicable) {
      return {
        project,
        group,
        value: 0,
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
      vs_prev: vsPrev,
      anchor_count: cur?.anchor_count ?? 0,
      sparkline: sparkMap.get(`${project}:${group}`) ?? [],
    };
  }

  function buildProject(project: "ddz" | "three"): ProjectBreakdown {
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
  };
}

export async function getDashboardOverview(
  dateFrom: string,
  dateTo: string,
): Promise<DashboardOverviewResponse> {
  const metrics: Section2Metric[] = [
    "live_flow",
    "video_flow",
    "install_or_activate",
    "show_uv",
    "watch_uv",
  ];
  const [core, ...breakdownArr] = await Promise.all([
    getCoreKpis(dateFrom, dateTo),
    ...metrics.map(async (m) => ({
      metric: m,
      ...(await getSection2Breakdown(m, dateFrom, dateTo)),
    })),
  ]);
  return {
    date_from: dateFrom,
    date_to: dateTo,
    core,
    breakdown: breakdownArr,
  };
}

/* ──────────────────── 抽屉详情（重构：一次性查 9 维度日级数据） ──────────────────── */

const PROJECT_LABEL: Record<"ddz" | "three", string> = {
  ddz: "斗地主",
  three: "三国",
};
const GROUP_LABEL: Record<"all" | "online" | "offline" | "other", string> = {
  all: "总",
  online: "线上",
  offline: "线下",
  other: "其他",
};

function buildTitle(filters: DrawerDetailFilters): string {
  if (!filters.project) return "全业务";
  const project = PROJECT_LABEL[filters.project];
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
): Promise<Map<DrawerMetric, Map<string, number>>> {
  const fromUnix = Math.floor(new Date(dateFrom + "T00:00:00").getTime() / 1000);
  const toUnix = Math.floor(new Date(dateTo + "T23:59:59").getTime() / 1000);

  // ─── Section 1：4 个 metric ────────────────────────────
  // total_fan_ticket、active_anchor_count（基于 anchor_daily）
  const adailyP = db.execute(sql`
    WITH ${anchorGroupCte()}
    SELECT ad.date AS d,
      COALESCE(SUM(ad.total_fan_ticket), 0)::numeric AS total_fan_ticket,
      COUNT(DISTINCT ad.anchor_id) FILTER (WHERE ad.live_duration_1d > 0)::int AS active_anchor_count,
      COALESCE(SUM(ad.live_duration_1d), 0)::numeric AS live_duration
    FROM anchor_daily ad
    JOIN anchor_group ag ON ag.anchor_id = ad.anchor_id
    WHERE ${groupFilter(filters)}
      AND ad.date >= ${dateFrom} AND ad.date <= ${dateTo}
    GROUP BY ad.date ORDER BY ad.date
  `);

  // flow（Section 1）：斗地主 cps_all 全 scene + 三国 minigame
  const ddzFlowP = db.execute(sql`
    WITH ${anchorGroupCte()}
    SELECT agp.date AS d,
      COALESCE(SUM(
        (COALESCE(agp.promote_anchor_active_pay_amount_1d, 0) + COALESCE(agp.promote_faction_active_pay_amount_1d, 0)) / 0.4
        + COALESCE(agp.promote_download_pay_amount_1d, 0)
      ), 0)::numeric AS v
    FROM anchor_game_promo_daily agp
    JOIN anchor_group ag ON ag.anchor_id = agp.anchor_id
    WHERE ag.project = 'ddz'
      AND ${groupFilter(filters)}
      AND agp.biz_mode = 'cps_all'
      AND agp.date >= ${dateFrom} AND agp.date <= ${dateTo}
    GROUP BY agp.date ORDER BY agp.date
  `);

  const threeFlowP = db.execute(sql`
    WITH ${anchorGroupCte()}
    SELECT mg.date AS d,
      COALESCE(SUM(mg.before_divided_income), 0)::numeric AS v
    FROM anchor_minigame_daily mg
    JOIN anchor_group ag ON ag.anchor_id = mg.anchor_id
    WHERE ag.project = 'three'
      AND ${groupFilter(filters)}
      AND mg.date >= ${dateFrom} AND mg.date <= ${dateTo}
    GROUP BY mg.date ORDER BY mg.date
  `);

  // new_anchor_count：按 join_time 入驻日聚合
  const newP = db.execute(sql`
    WITH ${anchorGroupCte()}
    SELECT TO_CHAR(TO_TIMESTAMP(ap.join_time), 'YYYY-MM-DD') AS d,
      COUNT(*)::int AS v
    FROM anchor_profile ap
    JOIN anchor_group ag ON ag.anchor_id = ap.anchor_id
    WHERE ${groupFilter(filters)}
      AND ap.join_time IS NOT NULL
      AND ap.join_time >= ${fromUnix} AND ap.join_time <= ${toUnix}
    GROUP BY 1 ORDER BY 1
  `);

  // ─── Section 2：5 个 metric ────────────────────────────
  // live_flow（ddz）/ live_flow（three） / video_flow（ddz only） / install_or_activate（ddz） / install_or_activate（three）
  const ddzLiveFlowP = db.execute(sql`
    WITH ${anchorGroupCte()}
    SELECT agp.date AS d,
      COALESCE(SUM(
        (COALESCE(agp.promote_anchor_active_pay_amount_1d, 0) + COALESCE(agp.promote_faction_active_pay_amount_1d, 0)) / 0.4
        + COALESCE(agp.promote_download_pay_amount_1d, 0)
      ), 0)::numeric AS v
    FROM anchor_game_promo_daily agp
    JOIN anchor_group ag ON ag.anchor_id = agp.anchor_id
    WHERE ag.project = 'ddz'
      AND ${groupFilter(filters)}
      AND agp.biz_mode = 'cps_all' AND agp.promote_scene = 'live'
      AND agp.date >= ${dateFrom} AND agp.date <= ${dateTo}
    GROUP BY agp.date ORDER BY agp.date
  `);

  const threeLiveFlowP = db.execute(sql`
    WITH ${anchorGroupCte()}
    SELECT mg.date AS d,
      COALESCE(SUM(mg.before_divided_income), 0)::numeric AS v
    FROM anchor_minigame_daily mg
    JOIN anchor_group ag ON ag.anchor_id = mg.anchor_id
    WHERE ag.project = 'three'
      AND ${groupFilter(filters)}
      AND mg.date >= ${dateFrom} AND mg.date <= ${dateTo}
    GROUP BY mg.date ORDER BY mg.date
  `);

  const ddzVideoFlowP = db.execute(sql`
    WITH ${anchorGroupCte()}
    SELECT agp.date AS d,
      COALESCE(SUM(
        (COALESCE(agp.promote_anchor_active_pay_amount_1d, 0) + COALESCE(agp.promote_faction_active_pay_amount_1d, 0)) / 0.4
        + COALESCE(agp.promote_download_pay_amount_1d, 0)
      ), 0)::numeric AS v
    FROM anchor_game_promo_daily agp
    JOIN anchor_group ag ON ag.anchor_id = agp.anchor_id
    WHERE ag.project = 'ddz'
      AND ${groupFilter(filters)}
      AND agp.biz_mode = 'cps_all' AND agp.promote_scene = 'video'
      AND agp.date >= ${dateFrom} AND agp.date <= ${dateTo}
    GROUP BY agp.date ORDER BY agp.date
  `);

  const ddzInstallP = db.execute(sql`
    WITH ${anchorGroupCte()}
    SELECT agp.date AS d,
      COALESCE(SUM(agp.promote_install_finish_ucnt_1d), 0)::numeric AS v
    FROM anchor_game_promo_daily agp
    JOIN anchor_group ag ON ag.anchor_id = agp.anchor_id
    WHERE ag.project = 'ddz'
      AND ${groupFilter(filters)}
      AND agp.biz_mode = 'cps'
      AND agp.date >= ${dateFrom} AND agp.date <= ${dateTo}
    GROUP BY agp.date ORDER BY agp.date
  `);

  const threeActiveP = db.execute(sql`
    WITH ${anchorGroupCte()}
    SELECT mg.date AS d,
      COALESCE(SUM(mg.gm_active_ucnt), 0)::numeric AS v
    FROM anchor_minigame_daily mg
    JOIN anchor_group ag ON ag.anchor_id = mg.anchor_id
    WHERE ag.project = 'three'
      AND ${groupFilter(filters)}
      AND mg.date >= ${dateFrom} AND mg.date <= ${dateTo}
    GROUP BY mg.date ORDER BY mg.date
  `);

  const showUvP = db.execute(sql`
    WITH ${anchorGroupCte()}
    SELECT pd.date AS d,
      COALESCE(SUM(pd.show_uv), 0)::numeric AS v
    FROM anchor_portrait_daily pd
    JOIN anchor_group ag ON ag.anchor_id = pd.anchor_id
    WHERE ${groupFilter(filters)}
      AND pd.date >= ${dateFrom} AND pd.date <= ${dateTo}
    GROUP BY pd.date ORDER BY pd.date
  `);

  const watchUvP = db.execute(sql`
    WITH ${anchorGroupCte()}
    SELECT pd.date AS d,
      COALESCE(SUM(pd.watch_uv), 0)::numeric AS v
    FROM anchor_portrait_daily pd
    JOIN anchor_group ag ON ag.anchor_id = pd.anchor_id
    WHERE ${groupFilter(filters)}
      AND pd.date >= ${dateFrom} AND pd.date <= ${dateTo}
    GROUP BY pd.date ORDER BY pd.date
  `);

  const [
    adailyR,
    ddzFlowR,
    threeFlowR,
    newR,
    ddzLiveR,
    threeLiveR,
    ddzVideoR,
    ddzInstallR,
    threeActiveR,
    showUvR,
    watchUvR,
  ] = await Promise.all([
    adailyP,
    ddzFlowP,
    threeFlowP,
    newP,
    ddzLiveFlowP,
    threeLiveFlowP,
    ddzVideoFlowP,
    ddzInstallP,
    threeActiveP,
    showUvP,
    watchUvP,
  ]);

  function toMap(rows: unknown, key = "v"): Map<string, number> {
    const m = new Map<string, number>();
    (rows as Record<string, unknown>[]).forEach((r) => {
      m.set(String(r.d), Number(r[key] ?? 0));
    });
    return m;
  }

  // 合并跨项目的 flow（Section 1）
  function unionFlow(a: Map<string, number>, b: Map<string, number>): Map<string, number> {
    const out = new Map<string, number>();
    for (const [k, v] of a) out.set(k, (out.get(k) ?? 0) + v);
    for (const [k, v] of b) out.set(k, (out.get(k) ?? 0) + v);
    return out;
  }

  const adailyRows = adailyR as unknown as Record<string, unknown>[];
  const totalFanTicketMap = new Map<string, number>();
  const activeMap = new Map<string, number>();
  adailyRows.forEach((r) => {
    totalFanTicketMap.set(String(r.d), Number(r.total_fan_ticket ?? 0));
    activeMap.set(String(r.d), Number(r.active_anchor_count ?? 0));
  });

  const ddzFlowMap = toMap(ddzFlowR);
  const threeFlowMap = toMap(threeFlowR);

  // Section 1 flow：合并 ddz cps_all 全 scene + 三国 minigame（按 filters.project 限制）
  let flowMap: Map<string, number>;
  if (filters.project === "ddz") flowMap = ddzFlowMap;
  else if (filters.project === "three") flowMap = threeFlowMap;
  else flowMap = unionFlow(ddzFlowMap, threeFlowMap);

  // live_flow：ddz scene=live + 三国 minigame（按 filters.project 限制）
  const ddzLiveMap = toMap(ddzLiveR);
  const threeLiveMap = toMap(threeLiveR);
  let liveFlowMap: Map<string, number>;
  if (filters.project === "ddz") liveFlowMap = ddzLiveMap;
  else if (filters.project === "three") liveFlowMap = threeLiveMap;
  else liveFlowMap = unionFlow(ddzLiveMap, threeLiveMap);

  // video_flow：仅斗地主有数据；三国 → 0（filters.project='three' 时返回空）
  const ddzVideoMap = toMap(ddzVideoR);
  let videoFlowMap: Map<string, number>;
  if (filters.project === "three") videoFlowMap = new Map();
  else videoFlowMap = ddzVideoMap;

  // install_or_activate：ddz install_finish + 三国 gm_active（按 filters.project 限制）
  const ddzInstallMap = toMap(ddzInstallR);
  const threeActiveMap = toMap(threeActiveR);
  let installOrActivateMap: Map<string, number>;
  if (filters.project === "ddz") installOrActivateMap = ddzInstallMap;
  else if (filters.project === "three") installOrActivateMap = threeActiveMap;
  else installOrActivateMap = unionFlow(ddzInstallMap, threeActiveMap);

  // 用 metric 名作 key
  const result = new Map<DrawerMetric, Map<string, number>>();
  result.set("total_fan_ticket", totalFanTicketMap);
  result.set("flow", flowMap);
  result.set("active_anchor_count", activeMap);
  result.set("new_anchor_count", toMap(newR));
  result.set("live_flow", liveFlowMap);
  result.set("video_flow", videoFlowMap);
  result.set("install_or_activate", installOrActivateMap);
  result.set("show_uv", toMap(showUvR));
  result.set("watch_uv", toMap(watchUvR));
  return result;
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
    "live_flow",
    "video_flow",
    "install_or_activate",
    "show_uv",
    "watch_uv",
  ];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86400_000);
    const ds = d.toISOString().slice(0, 10);
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
 * 抽屉详情：title + 9 KPI + 当前 daily_rows + 前周期 prev_daily_rows
 */
export async function getDrawerDetail(filters: DrawerDetailFilters): Promise<DrawerDetailResponse> {
  const { date_from: dateFrom, date_to: dateTo } = filters;
  const days =
    Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400_000) + 1;
  const prevFrom = shiftDate(dateFrom, -days);
  const prevTo = shiftDate(dateTo, -days);

  const [curMatrix, prevMatrix] = await Promise.all([
    fetchDailyMatrix(filters, dateFrom, dateTo),
    fetchDailyMatrix(filters, prevFrom, prevTo),
  ]);

  // 哪些 metric 不适用（依据 filters.project）
  const notApplicable = new Set<DrawerMetric>();
  if (filters.project === "three") {
    notApplicable.add("video_flow");
  }

  const dailyRows = buildDailyRows(curMatrix, dateFrom, dateTo, notApplicable);
  const prevDailyRows = buildDailyRows(prevMatrix, prevFrom, prevTo, notApplicable);

  // 9 KPI（顺序：4 Section 1 + 5 Section 2）
  const kpiSpec: { key: DrawerMetric; label: string; unit?: string }[] = [
    { key: "total_fan_ticket", label: "音浪" },
    { key: "flow", label: "流水" },
    { key: "active_anchor_count", label: "开播主播", unit: "人" },
    { key: "new_anchor_count", label: "新入驻", unit: "人" },
    { key: "live_flow", label: "直播流水" },
    { key: "video_flow", label: "短视频流水" },
    {
      key: "install_or_activate",
      // 在 ddz 上下文显示「安装」，在 three 上下文显示「激活」，跨项目时显示「安装/激活」
      label:
        filters.project === "ddz" ? "安装" : filters.project === "three" ? "激活" : "安装/激活",
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
  };
}
