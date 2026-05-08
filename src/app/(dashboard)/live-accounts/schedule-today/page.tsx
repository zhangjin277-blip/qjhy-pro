import { db } from "@/db/client";
import { dingtalk_user, live_anchor } from "@/db/schema";
import { daily_schedule_day, daily_schedule_segment } from "@/db/schema/daily-schedule";
import { and, eq, inArray } from "drizzle-orm";
import { listAccounts } from "@/modules/live-account/server";
import { listBindings } from "@/modules/live-anchor";
import { TodayGantt } from "./_components/today-gantt";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isoWeekday(date: string): number {
  // 1=Mon..7=Sun
  const dow = new Date(date + "T12:00:00Z").getUTCDay();
  return dow === 0 ? 7 : dow;
}

function parseHour(t: string): number {
  return parseInt(t.split(":")[0] ?? "0", 10);
}

function parseSlotHours(slot: [string, string]) {
  const startHour = parseHour(slot[0]);
  let endHour = parseHour(slot[1]);
  if (endHour <= startHour) endHour += 24;
  return { startHour, endHour };
}

interface DayRow {
  id: string;
  account_id: string;
  date: string;
  dingtalk_user_id: string;
  anchor_name: string | null;
  start_hour: number;
  end_hour: number;
  is_rest: boolean;
  source: string;
  reason: string | null;
}

export default async function ScheduleTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; product?: string }>;
}) {
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : isoDate(new Date());
  const weekday = isoWeekday(date);
  const product = sp.product ?? "all"; // 默认全部产品；?product=捕鱼大作战 切单产品

  const [accounts, allBindings, candidates] = await Promise.all([
    listAccounts(product === "all" ? {} : { product }),
    listBindings({}),
    db
      .select({
        user_id: dingtalk_user.user_id,
        name: dingtalk_user.name,
        title: dingtalk_user.title,
      })
      .from(live_anchor)
      .innerJoin(dingtalk_user, eq(live_anchor.dingtalk_user_id, dingtalk_user.user_id))
      .where(eq(dingtalk_user.active, true))
      .orderBy(dingtalk_user.name),
  ]);

  const accountIds = accounts.map((account) => account.id);
  let dayRows: DayRow[] = [];
  let initializedRows: { account_id: string }[] = [];
  if (accountIds.length > 0) {
    [dayRows, initializedRows] = await Promise.all([
      db
        .select({
          id: daily_schedule_segment.id,
          account_id: daily_schedule_segment.account_id,
          date: daily_schedule_segment.date,
          dingtalk_user_id: daily_schedule_segment.dingtalk_user_id,
          anchor_name: dingtalk_user.name,
          start_hour: daily_schedule_segment.start_hour,
          end_hour: daily_schedule_segment.end_hour,
          is_rest: daily_schedule_segment.is_rest,
          source: daily_schedule_segment.source,
          reason: daily_schedule_segment.reason,
        })
        .from(daily_schedule_segment)
        .leftJoin(dingtalk_user, eq(daily_schedule_segment.dingtalk_user_id, dingtalk_user.user_id))
        .where(
          and(
            eq(daily_schedule_segment.date, date),
            inArray(daily_schedule_segment.account_id, accountIds),
          ),
        ),
      db
        .select({ account_id: daily_schedule_day.account_id })
        .from(daily_schedule_day)
        .where(
          and(
            eq(daily_schedule_day.date, date),
            inArray(daily_schedule_day.account_id, accountIds),
          ),
        ),
    ]);
  }

  const stateAccountIds = new Set(initializedRows.map((row) => row.account_id));
  const segmentAccountIds = new Set(dayRows.map((row) => row.account_id));
  const stateRows = [];
  const seedRows = [];
  for (const acc of accounts) {
    if (!stateAccountIds.has(acc.id)) {
      stateRows.push({
        account_id: acc.id,
        date,
        created_by: null,
      });
    }
    if (stateAccountIds.has(acc.id) || segmentAccountIds.has(acc.id)) continue;
    const accBindings = allBindings.filter((binding) => binding.account_id === acc.id);
    for (const binding of accBindings) {
      const restDays = (binding.rest_days as number[] | null) ?? [];
      if (restDays.includes(weekday)) continue;
      const slots = (binding.time_slots as [string, string][] | null) ?? [];
      for (const slot of slots) {
        const { startHour, endHour } = parseSlotHours(slot);
        // schema check: end_hour <= 28（最多到次日 04:00）；超界跳过避免 INSERT 失败
        if (startHour < 0 || endHour <= startHour || endHour > 28) continue;
        seedRows.push({
          account_id: acc.id,
          date,
          dingtalk_user_id: binding.dingtalk_user_id,
          start_hour: startHour,
          end_hour: endHour,
          is_rest: false,
          source: "default",
          reason: null,
          created_by: null,
        });
      }
    }
  }

  if (stateRows.length > 0) {
    await db.insert(daily_schedule_day).values(stateRows).onConflictDoNothing();
  }

  if (seedRows.length > 0) {
    await db.insert(daily_schedule_segment).values(seedRows);
    dayRows = await db
      .select({
        id: daily_schedule_segment.id,
        account_id: daily_schedule_segment.account_id,
        date: daily_schedule_segment.date,
        dingtalk_user_id: daily_schedule_segment.dingtalk_user_id,
        anchor_name: dingtalk_user.name,
        start_hour: daily_schedule_segment.start_hour,
        end_hour: daily_schedule_segment.end_hour,
        is_rest: daily_schedule_segment.is_rest,
        source: daily_schedule_segment.source,
        reason: daily_schedule_segment.reason,
      })
      .from(daily_schedule_segment)
      .leftJoin(dingtalk_user, eq(daily_schedule_segment.dingtalk_user_id, dingtalk_user.user_id))
      .where(
        and(
          eq(daily_schedule_segment.date, date),
          inArray(daily_schedule_segment.account_id, accountIds),
        ),
      );
  }

  // 合并 default + override，每个账号产生 segments
  interface Segment {
    user_id: string;
    user_name: string | null;
    start: number; // 0..27 (跨夜支持)
    end: number;
    source: "default" | "override";
    is_rest: boolean;
    override_id?: string;
    reason?: string | null;
  }

  interface AccountSchedule {
    account_id: string;
    account_name: string;
    platform: string;
    product: string;
    placement_label: string | null;
    segments: Segment[];
  }

  const data: AccountSchedule[] = accounts.map((acc) => {
    const segments: Segment[] = dayRows
      .filter((row) => row.account_id === acc.id)
      .map((row) => ({
        user_id: row.dingtalk_user_id,
        user_name: row.anchor_name,
        start: row.start_hour,
        end: row.end_hour,
        source: row.source === "default" ? "default" : "override",
        is_rest: row.is_rest,
        override_id: row.id,
        reason: row.reason,
      }));

    return {
      account_id: acc.id,
      account_name: acc.account_name,
      platform: acc.platform,
      product: acc.product,
      placement_label: acc.placement_label,
      segments,
    };
  });

  return (
    <div className="min-w-0 max-w-full space-y-3 px-1 py-1 md:px-1.5 md:py-1.5">
      <div className="flex items-center gap-1 border-b border-slate-200 pb-1">
        <span className="mr-2 px-3 py-1.5 text-sm font-semibold text-slate-700">今日排班</span>
        <span className="ml-auto px-3 text-xs text-muted-foreground">
          点击色块改主播 · 今日排班独立保存
        </span>
      </div>
      <TodayGantt date={date} accounts={data} candidates={candidates} />
    </div>
  );
}
