import "server-only";
import { db } from "@/db/client";
import { and, asc, eq, gte, lt, or, sql } from "drizzle-orm";
import { live_session_log, live_account, dingtalk_user } from "@/db/schema";

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

/**
 * 拉指定日期当天的所有 session_log。
 *
 * 一天的 session 定义：start_at 落在 [date, date+1) 区间 OR in_progress（跨日仍在播）。
 * 这样跨日 session 不会丢，但会同时出现在两天的视图里（不去重，UI 控制是否截断）。
 *
 * @param date YYYY-MM-DD，本地时区
 * @param product 可选，按 live_account.product 过滤
 */
export async function getCheckinDay(date: string, product?: string): Promise<CheckinDayResult> {
  // 业务日窗口：当天 0:00 → 次日 9:00（33h），覆盖跨夜班
  const dayStart = new Date(date + "T00:00:00");
  const dayEnd = new Date(date + "T00:00:00");
  dayEnd.setDate(dayEnd.getDate() + 1);
  dayEnd.setHours(9);

  const dayWindow = or(
    and(gte(live_session_log.start_at, dayStart), lt(live_session_log.start_at, dayEnd)),
    eq(live_session_log.status, "in_progress"),
  );
  if (!dayWindow) throw new Error("getCheckinDay: failed to build day-window predicate");
  const conditions = [dayWindow];
  if (product) conditions.push(eq(live_account.product, product));

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
    });
  }

  return {
    date,
    accounts: [...map.values()],
  };
}
