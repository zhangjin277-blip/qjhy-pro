import "server-only";
import { db } from "@/db/client";
import { and, asc, eq, gte, ilike, lt, or, sql } from "drizzle-orm";
import { live_session_log, live_account, dingtalk_user } from "@/db/schema";
import type { PlacementScope } from "@/modules/placement/server";

export interface CheckinDaySession {
  session_id: string;
  anchor_dingtalk_user_id: string;
  anchor_name: string;
  start_at: string;
  end_at: string | null;
  status: string;
  closed_by: string | null;
  duration_seconds: number | null;
  /** 该 session 时间窗内按 ks baseinfo snapshot 算的礼物流水（分）。null = 没有 snapshot 数据 */
  income_cents: number | null;
  /**
   * 投放数据按时长比例分配（session 在每个 hour bucket 的覆盖秒数 / 同 hour 同账号所有 session 总覆盖秒数）。
   * 对应账号该 hour 内所有 dataset_id 的 placement_row 求和后乘以分配比例。
   * null = 该 session 未覆盖到任何 placement 数据。
   */
  cost_yuan: number | null;
  activations: number | null;
  payment_yuan: number | null;
}

export interface CheckinDayAccount {
  live_account_id: string;
  account_name: string;
  placement_label: string | null;
  platform: string;
  product: string;
  avatar: string | null;
  sessions: CheckinDaySession[];
}

export interface CheckinDayResult {
  date: string;
  accounts: CheckinDayAccount[];
}

export interface CheckinRangeOptions {
  product?: string;
  accountQuery?: string;
  scope?: PlacementScope;
}

/**
 * 拉指定日期当天的所有 session_log。
 *
 * 一天的 session 定义：start_at 落在 [date, date+1) 区间 OR in_progress（跨日仍在播）。
 * 这样跨日 session 不会丢，但会同时出现在两天的视图里（不去重，UI 控制是否截断）。
 *
 * @param date YYYY-MM-DD，本地时区
 * @param product 可选，按 live_account.product 过滤
 */
export async function getCheckinDay(
  date: string,
  product?: string,
  scope?: PlacementScope,
): Promise<CheckinDayResult> {
  return getCheckinRange(date, date, { product, scope }, true);
}

/**
 * 拉取起止业务日内的 session，每个场次只返回一次。
 * 结束日延伸至次日 09:00，与单日页面的跨夜班口径一致。
 */
export async function getCheckinRange(
  dateFrom: string,
  dateTo: string,
  options: CheckinRangeOptions = {},
  includeAnyInProgress = false,
): Promise<CheckinDayResult> {
  const rangeStart = new Date(dateFrom + "T00:00:00");
  const rangeEnd = new Date(dateTo + "T00:00:00");
  rangeEnd.setDate(rangeEnd.getDate() + 1);
  rangeEnd.setHours(9);

  const startedInRange = and(
    gte(live_session_log.start_at, rangeStart),
    lt(live_session_log.start_at, rangeEnd),
  );
  const rangeWindow = includeAnyInProgress
    ? or(startedInRange, eq(live_session_log.status, "in_progress"))
    : startedInRange;
  if (!rangeWindow) throw new Error("getCheckinRange: failed to build range predicate");

  const conditions = [rangeWindow];
  if (options.scope?.kind === "reject") {
    conditions.push(sql`FALSE`);
  } else if (options.scope?.kind === "user_ids") {
    conditions.push(
      options.scope.ids.length === 0
        ? sql`FALSE`
        : sql`${live_session_log.anchor_dingtalk_user_id} = ANY(ARRAY[${sql.join(
            options.scope.ids.map((id) => sql`${id}`),
            sql`, `,
          )}]::text[])`,
    );
  }
  if (options.product) conditions.push(eq(live_account.product, options.product));
  const accountQuery = options.accountQuery?.trim();
  if (accountQuery) {
    const accountMatch = or(
      ilike(live_account.account_name, `%${accountQuery}%`),
      ilike(live_account.placement_label, `%${accountQuery}%`),
    );
    if (accountMatch) conditions.push(accountMatch);
  }

  const rows = await db
    .select({
      session_id: live_session_log.id,
      live_account_id: live_session_log.live_account_id,
      anchor_dingtalk_user_id: live_session_log.anchor_dingtalk_user_id,
      anchor_name: dingtalk_user.name,
      start_at: live_session_log.start_at,
      end_at: live_session_log.end_at,
      status: live_session_log.status,
      closed_by: live_session_log.closed_by,
      duration_seconds: live_session_log.duration_seconds,
      account_name: live_account.account_name,
      placement_label: live_account.placement_label,
      platform: live_account.platform,
      product: live_account.product,
      avatar: live_account.avatar,
    })
    .from(live_session_log)
    .innerJoin(live_account, eq(live_account.id, live_session_log.live_account_id))
    .leftJoin(dingtalk_user, eq(dingtalk_user.user_id, live_session_log.anchor_dingtalk_user_id))
    .where(and(...conditions))
    .orderBy(
      asc(live_account.product),
      asc(live_account.placement_label),
      asc(live_session_log.start_at),
    );

  // 一次性算所有 session 的 ks 礼物流水（口径 = SUM_VALID_INCOME 直播流水）
  //   按 (live_account.platform_account_id = member_id) + 时间窗匹配 trend 表
  //   per_stream = MAX(income) - MIN(income) GROUP BY live_stream_id_str（处理换场重置）
  const sessionIds = rows.map((r) => r.session_id);
  const incomeBySession = new Map<string, number>();
  if (sessionIds.length > 0) {
    const incomeRows = await db.execute<{ session_id: string; income_cents: string }>(sql`
      WITH per_stream AS (
        SELECT
          l.id AS session_id,
          t.live_stream_id_str,
          MAX(t.valid_income_cents) - MIN(t.valid_income_cents) AS diff_cents
        FROM live_session_log l
        JOIN live_account la ON la.id = l.live_account_id
        JOIN kuaishou_live_trend t
          ON t.member_id = la.platform_account_id
         AND t.ts >= l.start_at
         AND t.ts <= COALESCE(l.end_at, now())
        WHERE l.id IN (${sql.join(
          sessionIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
        GROUP BY l.id, t.live_stream_id_str
      )
      SELECT session_id::text, SUM(diff_cents)::text AS income_cents
      FROM per_stream
      GROUP BY session_id
    `);
    for (const r of incomeRows) {
      incomeBySession.set(r.session_id, Number(r.income_cents));
    }
  }

  // 投放数据按时长比例分配
  //   1. session_hours: 每个 session 在 [start_at, end_at) 内每个本地小时 bucket 的覆盖秒数
  //      （placement_row 的 date/hour 是本地时间，所以 generate_series 也按本地时间）
  //   2. hour_totals: 同 (date, hour, live_account_id) 下所有 session 的总覆盖秒数
  //   3. placement_hour: placement_row 按 (date, hour, live_account_id) 求和（多 dataset 合并）
  //   4. 最终 = SUM(placement × session_coverage / total_coverage)
  interface PlacementAgg {
    cost_yuan: number;
    activations: number;
    payment_yuan: number;
  }
  const placementBySession = new Map<string, PlacementAgg>();
  if (sessionIds.length > 0) {
    const placementRows = await db.execute<{
      session_id: string;
      cost_yuan: string;
      activations: string;
      payment_yuan: string;
    }>(sql`
      WITH session_hours AS (
        SELECT
          l.id AS session_id,
          l.live_account_id,
          hs::date AS p_date,
          EXTRACT(HOUR FROM hs)::int AS p_hour,
          EXTRACT(EPOCH FROM (
            LEAST(
              (COALESCE(l.end_at, now()) AT TIME ZONE 'Asia/Shanghai')::timestamp,
              hs + interval '1 hour'
            )
            -
            GREATEST(
              (l.start_at AT TIME ZONE 'Asia/Shanghai')::timestamp,
              hs
            )
          )) AS coverage_sec
        FROM live_session_log l
        CROSS JOIN LATERAL generate_series(
          date_trunc('hour', (l.start_at AT TIME ZONE 'Asia/Shanghai')::timestamp),
          date_trunc('hour', (COALESCE(l.end_at, now()) AT TIME ZONE 'Asia/Shanghai')::timestamp),
          interval '1 hour'
        ) hs
        WHERE l.id IN (${sql.join(
          sessionIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
      ),
      hour_totals AS (
        SELECT p_date, p_hour, live_account_id, SUM(coverage_sec) AS total_sec
        FROM session_hours
        GROUP BY p_date, p_hour, live_account_id
      ),
      placement_hour AS (
        SELECT
          p.date AS p_date,
          p.hour AS p_hour,
          p.live_account_id,
          SUM(p.cost_yuan)::numeric AS cost_yuan,
          SUM(p.activations)::int AS activations,
          SUM(p.payment_yuan)::numeric AS payment_yuan
        FROM placement_row p
        WHERE EXISTS (
          SELECT 1 FROM session_hours sh
          WHERE sh.p_date = p.date AND sh.p_hour = p.hour AND sh.live_account_id = p.live_account_id
        )
        GROUP BY p.date, p.hour, p.live_account_id
      )
      SELECT
        sh.session_id::text,
        SUM(ph.cost_yuan * sh.coverage_sec / NULLIF(ht.total_sec, 0))::text AS cost_yuan,
        SUM(ph.activations::numeric * sh.coverage_sec / NULLIF(ht.total_sec, 0))::text AS activations,
        SUM(ph.payment_yuan * sh.coverage_sec / NULLIF(ht.total_sec, 0))::text AS payment_yuan
      FROM session_hours sh
      JOIN hour_totals ht
        ON ht.p_date = sh.p_date AND ht.p_hour = sh.p_hour AND ht.live_account_id = sh.live_account_id
      JOIN placement_hour ph
        ON ph.p_date = sh.p_date AND ph.p_hour = sh.p_hour AND ph.live_account_id = sh.live_account_id
      WHERE sh.coverage_sec > 0
      GROUP BY sh.session_id
    `);
    for (const r of placementRows) {
      placementBySession.set(r.session_id, {
        cost_yuan: Number(r.cost_yuan),
        activations: Number(r.activations),
        payment_yuan: Number(r.payment_yuan),
      });
    }
  }

  // 按 account 聚合
  const map = new Map<string, CheckinDayAccount>();
  for (const r of rows) {
    let acc = map.get(r.live_account_id);
    if (!acc) {
      acc = {
        live_account_id: r.live_account_id,
        account_name: r.account_name,
        placement_label: r.placement_label,
        platform: r.platform,
        product: r.product,
        avatar: r.avatar,
        sessions: [],
      };
      map.set(r.live_account_id, acc);
    }
    const placement = placementBySession.get(r.session_id) ?? null;
    acc.sessions.push({
      session_id: r.session_id,
      anchor_dingtalk_user_id: r.anchor_dingtalk_user_id,
      anchor_name: r.anchor_name ?? "（已离职）",
      start_at: r.start_at.toISOString(),
      end_at: r.end_at?.toISOString() ?? null,
      status: r.status,
      closed_by: r.closed_by,
      duration_seconds: r.duration_seconds,
      income_cents: incomeBySession.get(r.session_id) ?? null,
      cost_yuan: placement?.cost_yuan ?? null,
      activations: placement?.activations ?? null,
      payment_yuan: placement?.payment_yuan ?? null,
    });
  }

  return {
    date: dateFrom,
    accounts: [...map.values()],
  };
}
