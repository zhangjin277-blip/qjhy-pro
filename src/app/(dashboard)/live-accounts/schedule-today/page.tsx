import { db } from "@/db/client";
import { dingtalk_user } from "@/db/schema";
import { schedule_override } from "@/db/schema/schedule-override";
import { and, eq, sql } from "drizzle-orm";
import { listAccounts } from "@/modules/live-account/server";
import { listBindings } from "@/modules/live-anchor";
import { TodayGantt } from "./_components/today-gantt";

const LIVE_DEPT_ID = "724640467";

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

export default async function ScheduleTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; product?: string }>;
}) {
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : isoDate(new Date());
  const weekday = isoWeekday(date);
  const product = sp.product ?? "捕鱼大作战"; // 默认只看捕鱼；?product=all 看全部

  const [accounts, allBindings, dayOverrides, candidates] = await Promise.all([
    listAccounts(product === "all" ? {} : { product }),
    listBindings({}),
    db
      .select({
        id: schedule_override.id,
        account_id: schedule_override.account_id,
        date: schedule_override.date,
        dingtalk_user_id: schedule_override.dingtalk_user_id,
        anchor_name: dingtalk_user.name,
        time_slots: schedule_override.time_slots,
        reason: schedule_override.reason,
      })
      .from(schedule_override)
      .leftJoin(dingtalk_user, eq(schedule_override.dingtalk_user_id, dingtalk_user.user_id))
      .where(eq(schedule_override.date, date)),
    db
      .select({
        user_id: dingtalk_user.user_id,
        name: dingtalk_user.name,
        title: dingtalk_user.title,
      })
      .from(dingtalk_user)
      .where(
        and(
          eq(dingtalk_user.active, true),
          sql`${dingtalk_user.dept_ids} @> ${JSON.stringify([LIVE_DEPT_ID])}::jsonb`,
        ),
      )
      .orderBy(dingtalk_user.name),
  ]);

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
    const accBindings = allBindings.filter((b) => b.account_id === acc.id);
    const accOverrides = dayOverrides.filter((o) => o.account_id === acc.id);

    // 已 override 的用户集合（即便 slots=[] 也算覆盖）
    const overrideUserIds = new Set(accOverrides.map((o) => o.dingtalk_user_id));

    const segments: Segment[] = [];

    // 1. default 部分（排除：今天 rest 的 / 已被 override 的）
    for (const b of accBindings) {
      if (overrideUserIds.has(b.dingtalk_user_id)) continue;
      const restDays = (b.rest_days as number[] | null) ?? [];
      if (restDays.includes(weekday)) continue;
      const slots = (b.time_slots as [string, string][] | null) ?? [];
      for (const [s, e] of slots) {
        segments.push({
          user_id: b.dingtalk_user_id,
          user_name: b.anchor_name,
          start: parseHour(s),
          end: parseHour(e),
          source: "default",
          is_rest: false,
        });
      }
    }

    // 2. override 部分
    for (const ov of accOverrides) {
      const slots = (ov.time_slots as [string, string][] | null) ?? [];
      if (slots.length === 0) {
        // override 显式标记休息：找该用户的 default slots 标记成 is_rest 显示
        const defaultBinding = accBindings.find((b) => b.dingtalk_user_id === ov.dingtalk_user_id);
        const defaultSlots = (defaultBinding?.time_slots as [string, string][] | null) ?? [];
        for (const [s, e] of defaultSlots) {
          segments.push({
            user_id: ov.dingtalk_user_id,
            user_name: ov.anchor_name,
            start: parseHour(s),
            end: parseHour(e),
            source: "override",
            is_rest: true,
            override_id: ov.id,
            reason: ov.reason,
          });
        }
      } else {
        for (const [s, e] of slots) {
          segments.push({
            user_id: ov.dingtalk_user_id,
            user_name: ov.anchor_name,
            start: parseHour(s),
            end: parseHour(e),
            source: "override",
            is_rest: false,
            override_id: ov.id,
            reason: ov.reason,
          });
        }
      }
    }

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
          点击色块改主播 · 临时调班写入 schedule_override
        </span>
      </div>
      <TodayGantt date={date} accounts={data} candidates={candidates} />
    </div>
  );
}
