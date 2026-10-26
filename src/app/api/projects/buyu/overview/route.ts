import { BUYU_REPORT_COLUMNS } from "@/modules/buyu";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import { resolvePlacementScope } from "@/modules/placement/server";

const DATASETS = [
  { id: "product_buyu", label: "3D" },
  { id: "product_ue4", label: "UE4" },
  { id: "product_urp", label: "URP" },
] as const;

const DATASET_IDS = DATASETS.map((item) => item.id);

function dateIsValid(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function scopeSql(
  scope: Awaited<ReturnType<typeof resolvePlacementScope>>,
  column = sql`p.attributed_dingtalk_user_id`,
) {
  if (scope.kind === "all") return sql``;
  if (scope.kind === "reject" || scope.ids.length === 0) return sql`AND FALSE`;
  return sql`AND ${column} = ANY(ARRAY[${sql.join(
    scope.ids.map((id) => sql`${id}`),
    sql`, `,
  )}]::text[])`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const currentUser = await getCurrentDingtalkUser();
  if (currentUser.kind === "unauth")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (currentUser.kind === "user_not_synced") {
    return NextResponse.json({ error: "AUTH_USER_NOT_SYNCED" }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const from = searchParams.get("date_from");
  const to = searchParams.get("date_to");
  if (!dateIsValid(from) || !dateIsValid(to) || from > to) {
    return NextResponse.json({ error: "INVALID_DATE" }, { status: 400 });
  }
  const placementFromParam = searchParams.get("placement_from");
  const placementFrom = dateIsValid(placementFromParam) ? placementFromParam : from;
  if (placementFrom > from) {
    return NextResponse.json({ error: "INVALID_DATE" }, { status: 400 });
  }
  const anchorToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
  }).format(new Date());

  const placementScope = await resolvePlacementScope(
    currentUser.dingtalkUserId,
    currentUser.isEmergency,
    "project_buyu",
  );
  if (placementScope.kind === "reject") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const anchorPermission = currentUser.isEmergency
    ? null
    : await resolvePermission(currentUser.dingtalkUserId, "live_anchor");
  const canReadAnchors = currentUser.isEmergency || anchorPermission?.scope !== "none";

  try {
    const summaryRows = await db.execute(sql`
      WITH latest_daily AS (
        SELECT DISTINCT ON (c.dataset_id, c.live_account_id, c.subaccount_name, c.date)
          c.dataset_id, c.live_account_id, c.subaccount_name, c.date,
          c.cost_yuan, c.activations
        FROM placement_cumulative_raw c
        LEFT JOIN live_account a ON a.id = c.live_account_id
        WHERE c.date BETWEEN ${placementFrom} AND ${to}
          AND c.raw ? '_source_sheet'
          AND c.dataset_id IN (${sql.join(
            DATASET_IDS.map((id) => sql`${id}`),
            sql`, `,
          )})
          ${scopeSql(placementScope, sql`a.agent_dingtalk_user_id`)}
        ORDER BY c.dataset_id, c.live_account_id, c.subaccount_name, c.date, c.hour DESC
      ), latest_account_dates AS (
        SELECT dataset_id, live_account_id, MAX(date) AS date
        FROM latest_daily
        GROUP BY dataset_id, live_account_id
      ), latest_account_snapshot AS (
        SELECT latest_daily.*
        FROM latest_daily
        INNER JOIN latest_account_dates latest
          ON latest.dataset_id = latest_daily.dataset_id
          AND latest.live_account_id = latest_daily.live_account_id
          AND latest.date = latest_daily.date
      )
      SELECT
        dataset_id,
        COALESCE(SUM(cost_yuan), 0)::float AS cost,
        COALESCE(SUM(activations), 0)::int AS additions,
        CASE WHEN COALESCE(SUM(activations), 0) > 0
          THEN (SUM(cost_yuan) / SUM(activations))::float
          ELSE NULL END AS cpi
      FROM latest_account_snapshot
      GROUP BY dataset_id
    `);
    // 捕鱼直播只使用完整的累计日报。日志表保留每日快照，汇总卡片按直播账号最后日期汇总；
    // 小时投放表 placement_row 由投放数据板块单独使用。
    const dailyReportRows = await db.execute(sql`
      WITH latest_daily AS (
        SELECT DISTINCT ON (c.dataset_id, c.live_account_id, c.subaccount_name, c.date)
          c.dataset_id,
          c.live_account_id,
          c.subaccount_name,
          c.date,
          c.hour,
          c.cost_yuan::float AS cost,
          c.activations::int AS additions,
          c.payment_yuan::float AS payment,
          c.raw
        FROM placement_cumulative_raw c
        WHERE c.date BETWEEN ${placementFrom} AND ${to}
          AND c.raw ? '_source_sheet'
          AND c.dataset_id IN (${sql.join(
            DATASET_IDS.map((id) => sql`${id}`),
            sql`, `,
          )})
        ORDER BY c.dataset_id, c.live_account_id, c.subaccount_name, c.date, c.hour DESC
      )
      SELECT
        c.dataset_id,
        c.live_account_id,
        a.account_name,
        c.date,
        c.cost,
        c.additions,
        c.payment,
        c.raw
      FROM latest_daily c
      LEFT JOIN live_account a ON a.id = c.live_account_id
      WHERE 1 = 1
        ${scopeSql(placementScope, sql`a.agent_dingtalk_user_id`)}
      ORDER BY c.date DESC, c.dataset_id, a.account_name
    `);

    const normalizeReportKey = (value: string): string => value.replace(/[\s\r\n\t]/g, "").trim();
    const reportMetric = (raw: unknown, label: string): number | null => {
      if (!raw || typeof raw !== "object") return null;
      const wanted = normalizeReportKey(label);
      const entry = Object.entries(raw as Record<string, unknown>).find(
        ([key]) => normalizeReportKey(key) === wanted,
      );
      if (!entry || entry[1] === null || entry[1] === undefined || entry[1] === "") return null;
      if (typeof entry[1] === "number") return Number.isFinite(entry[1]) ? entry[1] : null;
      const parsed = Number(String(entry[1]).replace(/[元¥％%,\s]/g, ""));
      return Number.isFinite(parsed) ? parsed : null;
    };
    const normalizeDate = (value: unknown): string => {
      if (value instanceof Date) return value.toISOString().slice(0, 10);
      return String(value ?? "").slice(0, 10);
    };
    const monthSummaryForDate = (raw: unknown, date: string): unknown => {
      if (!raw || typeof raw !== "object") return null;
      const record = raw as Record<string, unknown>;
      const summaries = record._summary_months;
      if (summaries && typeof summaries === "object") {
        const summary = (summaries as Record<string, unknown>)[date.slice(0, 7)];
        if (summary && typeof summary === "object") return summary;
      }
      // 兼容重新导入前的旧行；部署后重新拉日报会填充 _summary_months。
      return record._summary_month ?? null;
    };
    const dailyMap = new Map<
      string,
      {
        dataset_id: string;
        live_account_id: string;
        account_name: string | null;
        date: string;
        cost: number;
        additions: number;
        payment: number;
        raw: Record<string, unknown> | null;
      }
    >();
    for (const source of dailyReportRows as unknown as Record<string, unknown>[]) {
      const date = normalizeDate(source.date);
      const key = `${source.dataset_id}|${source.live_account_id}|${date}`;
      const current = dailyMap.get(key);
      if (!current) {
        dailyMap.set(key, {
          dataset_id: String(source.dataset_id),
          live_account_id: String(source.live_account_id),
          account_name: source.account_name == null ? null : String(source.account_name),
          date,
          cost: Number(source.cost ?? 0),
          additions: Number(source.additions ?? 0),
          payment: Number(source.payment ?? 0),
          raw: (source.raw as Record<string, unknown> | null) ?? null,
        });
      } else {
        current.cost += Number(source.cost ?? 0);
        current.additions += Number(source.additions ?? 0);
        current.payment += Number(source.payment ?? 0);
      }
    }
    const reportAccountRows = await db.execute(sql`
      WITH latest_report_dates AS (
        SELECT dataset_id, MAX(date) AS date
        FROM placement_cumulative_raw
        WHERE date BETWEEN ${placementFrom} AND ${to}
          AND dataset_id IN (${sql.join(
            DATASET_IDS.map((id) => sql`${id}`),
            sql`, `,
          )})
          AND raw ? '_source_sheet'
        GROUP BY dataset_id
      )
      SELECT DISTINCT
        c.dataset_id,
        c.live_account_id,
        a.account_name
      FROM placement_cumulative_raw c
      INNER JOIN latest_report_dates latest
        ON latest.dataset_id = c.dataset_id
        AND latest.date = c.date
      LEFT JOIN live_account a ON a.id = c.live_account_id
      WHERE c.raw ? '_source_sheet'
        ${scopeSql(placementScope, sql`a.agent_dingtalk_user_id`)}
      ORDER BY c.dataset_id, a.account_name
    `);
    const dailyRows = [...dailyMap.values()].map((row) => ({
      ...row,
      cpi: row.additions > 0 ? row.cost / row.additions : null,
      realtime_roi: row.cost > 0 ? row.payment / row.cost : null,
    }));
    const accountDailyRows = dailyRows.map((row) => ({
      ...row,
      cpi: Number(row.additions) > 0 ? Number(row.cost) / Number(row.additions) : null,
      realtime_roi: Number(row.cost) > 0 ? Number(row.payment) / Number(row.cost) : null,
      summary_metrics: {
        year:
          row.raw &&
          typeof row.raw === "object" &&
          typeof (row.raw as Record<string, unknown>)._summary_year === "object"
            ? (row.raw as Record<string, unknown>)._summary_year
            : null,
        month: monthSummaryForDate(row.raw, row.date),
      },
    }));

    const summaryMetrics = (raw: unknown): Record<string, number | null> | undefined => {
      if (!raw || typeof raw !== "object") return undefined;
      const result: Record<string, number | null> = {};
      for (const column of BUYU_REPORT_COLUMNS) {
        result[column] = reportMetric(raw, column);
      }
      return result;
    };

    const anchors = canReadAnchors
      ? await db.execute(sql`
          SELECT
            la.business_line,
            la.dingtalk_user_id,
            COALESCE(du.name, la.external_name, '未配置姓名') AS name,
            la.employment_type,
            la.work_status,
            (
              SELECT COALESCE(json_agg(schedule_row), '[]'::json)
              FROM (
                SELECT
                  to_char(live.start_at AT TIME ZONE 'Asia/Shanghai', 'HH24:MI') AS start,
                  to_char(COALESCE(live.end_at, live.start_at + interval '4 hours') AT TIME ZONE 'Asia/Shanghai', 'HH24:MI') AS end
                FROM live_session_log live
                WHERE live.anchor_dingtalk_user_id = la.dingtalk_user_id
                  AND live.start_at::date = ${anchorToday}
                ORDER BY live.start_at DESC
                LIMIT 8
              ) schedule_row
            ) AS schedule_slots,
            COUNT(DISTINCT l.id)::int AS session_count,
            COALESCE(SUM(l.duration_seconds), 0)::bigint AS duration_seconds
          FROM live_anchor la
          LEFT JOIN dingtalk_user du ON du.user_id = la.dingtalk_user_id
          LEFT JOIN live_session_log l
            ON l.anchor_dingtalk_user_id = la.dingtalk_user_id
            AND l.start_at::date = ${anchorToday}
          WHERE la.business_line IN ('捕鱼大作战', '途游休闲捕鱼', '电玩捕鱼')
          GROUP BY la.business_line, la.dingtalk_user_id, du.name, la.external_name,
            la.employment_type, la.work_status
          ORDER BY la.business_line, la.work_status, name
        `)
      : [];
    const anchorDaily = canReadAnchors
      ? await db.execute(sql`
          SELECT
            la.business_line,
            (l.start_at AT TIME ZONE 'Asia/Shanghai')::date AS date,
            COUNT(DISTINCT l.anchor_dingtalk_user_id)::int AS active,
            COALESCE(SUM(l.duration_seconds), 0)::bigint AS duration_seconds
          FROM live_session_log l
          INNER JOIN live_account a ON a.id = l.live_account_id
          INNER JOIN live_anchor la ON la.dingtalk_user_id = l.anchor_dingtalk_user_id
          WHERE a.product IN ('捕鱼大作战', '途游休闲捕鱼', '电玩捕鱼')
            AND (l.start_at AT TIME ZONE 'Asia/Shanghai')::date = ${anchorToday}
          GROUP BY la.business_line, date
          ORDER BY date, la.business_line
        `)
      : [];
    // Keep the account rows used by the project cards, but leave monthly
    // placement metrics to the投流日志-derived rows above. The previous
    // per-account correlated monthly scans made this endpoint unnecessarily slow.
    const accounts = await db.execute(sql`
      SELECT
        a.id,
        a.account_name,
        a.product,
        a.platform,
        a.platform_account_id,
        a.platform_uid,
        a.avatar,
        a.phone_index,
        a.placement_label,
        a.live_status,
        r.room_no,
        COALESCE(du.name, '未配置') AS agent_name,
        du.title AS agent_title,
        0::float AS month_cost,
        NULL::float AS month_roi
      FROM live_account a
      LEFT JOIN live_room r ON r.id = a.room_id
      LEFT JOIN dingtalk_user du ON du.user_id = a.agent_dingtalk_user_id
      WHERE a.product IN ('捕鱼大作战', '途游休闲捕鱼', '电玩捕鱼')
      ORDER BY a.product, a.account_name
    `);
    const anchorAccounts = canReadAnchors
      ? await db.execute(sql`
          SELECT
            b.dingtalk_user_id AS user_id,
            a.id AS account_id,
            a.account_name,
            a.platform,
            a.platform_account_id,
            a.platform_uid,
            a.avatar,
            a.phone_index,
            r.room_no,
            b.time_slots,
            b.effective_from,
            b.effective_to
          FROM account_anchor_default b
          INNER JOIN live_account a ON a.id = b.account_id
          LEFT JOIN live_room r ON r.id = a.room_id
          WHERE a.product IN ('捕鱼大作战', '途游休闲捕鱼', '电玩捕鱼')
            AND b.effective_from <= ${anchorToday}
            AND (b.effective_to IS NULL OR b.effective_to >= ${anchorToday})
          ORDER BY b.dingtalk_user_id, a.product, a.account_name
        `)
      : [];
    const operators = await db.execute(sql`
      SELECT
        a.agent_dingtalk_user_id AS user_id,
        COALESCE(du.name, '未配置') AS name,
        du.title,
        COUNT(*)::int AS account_count,
        COUNT(*) FILTER (WHERE a.live_status = 'living')::int AS living_count
      FROM live_account a
      LEFT JOIN dingtalk_user du ON du.user_id = a.agent_dingtalk_user_id
      WHERE a.product IN ('捕鱼大作战', '途游休闲捕鱼', '电玩捕鱼')
      GROUP BY a.agent_dingtalk_user_id, du.name, du.title
      ORDER BY account_count DESC, name
    `);

    const labels = new Map<string, string>(DATASETS.map((item) => [item.id, item.label]));
    const summary = DATASETS.map((item) => {
      const row = (summaryRows as unknown as Record<string, unknown>[]).find(
        (candidate) => candidate.dataset_id === item.id,
      );
      return {
        id: item.id,
        label: item.label,
        cost: Number(row?.cost ?? 0),
        additions: Number(row?.additions ?? 0),
        cpi: row?.cpi == null ? null : Number(row.cpi),
      };
    });

    return NextResponse.json({
      summary,
      daily: (
        (accountDailyRows.length > 0 ? accountDailyRows : dailyRows) as unknown as Record<
          string,
          unknown
        >[]
      ).map((row) => ({
        product: labels.get(String(row.dataset_id)) ?? String(row.dataset_id),
        datasetId: row.dataset_id,
        accountId: row.live_account_id,
        accountName: row.account_name,
        date: row.date,
        cost: Number(row.cost ?? 0),
        additions: Number(row.additions ?? 0),
        cpi: row.cpi == null ? null : Number(row.cpi),
        payment: Number(row.payment ?? 0),
        realtimeRoi: row.realtime_roi == null ? null : Number(row.realtime_roi),
        reportMetrics: Object.fromEntries(
          BUYU_REPORT_COLUMNS.filter((column) => column !== "消耗" && column !== "新增").map(
            (label) => [label, reportMetric(row.raw, label)],
          ),
        ),
        summaryMetrics: {
          year: summaryMetrics(
            (
              (row as Record<string, unknown>).summary_metrics as
                | Record<string, unknown>
                | undefined
            )?.year,
          ),
          month: summaryMetrics(
            (
              (row as Record<string, unknown>).summary_metrics as
                | Record<string, unknown>
                | undefined
            )?.month,
          ),
        },
      })),
      accountOptions: (reportAccountRows as unknown as Record<string, unknown>[]).map((row) => ({
        id: String(row.live_account_id),
        accountId: row.live_account_id,
        product: labels.get(String(row.dataset_id)) ?? String(row.dataset_id),
        name: String(row.account_name ?? "未绑定账号"),
      })),
      anchors: (anchors as unknown as Record<string, unknown>[]).map((row) => ({
        product: row.business_line,
        userId: row.dingtalk_user_id,
        name: row.name,
        employmentType: row.employment_type,
        workStatus: row.work_status,
        scheduleSlots: row.schedule_slots ?? [],
        sessionCount: Number(row.session_count ?? 0),
        durationSeconds: Number(row.duration_seconds ?? 0),
      })),
      anchorDaily: (anchorDaily as unknown as Record<string, unknown>[]).map((row) => ({
        product: row.business_line,
        date: row.date,
        active: Number(row.active ?? 0),
        durationHours: Number(row.duration_seconds ?? 0) / 3600,
      })),
      operators: (operators as unknown as Record<string, unknown>[]).map((row) => ({
        userId: row.user_id,
        name: row.name,
        title: row.title,
        accountCount: Number(row.account_count ?? 0),
        livingCount: Number(row.living_count ?? 0),
      })),
      accounts: (accounts as unknown as Record<string, unknown>[]).map((row) => ({
        id: row.id,
        product: row.product,
        accountName: row.account_name,
        platform: row.platform,
        platformAccountId: row.platform_account_id,
        platformUid: row.platform_uid,
        avatar: row.avatar,
        phoneIndex: row.phone_index,
        placementLabel: row.placement_label,
        liveStatus: row.live_status,
        roomNo: row.room_no,
        agentName: row.agent_name,
        agentTitle: row.agent_title,
        monthCost: Number(row.month_cost ?? 0),
        monthRoi: row.month_roi == null ? null : Number(row.month_roi),
      })),
      anchorAccounts: (anchorAccounts as unknown as Record<string, unknown>[]).map((row) => ({
        userId: row.user_id,
        accountId: row.account_id,
        accountName: row.account_name,
        platform: row.platform,
        platformAccountId: row.platform_account_id,
        platformUid: row.platform_uid,
        avatar: row.avatar,
        phoneIndex: row.phone_index,
        roomNo: row.room_no,
        timeSlots: row.time_slots,
        effectiveFrom: row.effective_from,
        effectiveTo: row.effective_to,
      })),
    });
  } catch (error) {
    console.error("[/api/projects/buyu/overview]", error);
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
}
