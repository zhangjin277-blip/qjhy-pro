import "server-only";
import { db } from "@/db/client";
import { placement_row } from "@/db/schema/placements";
import { account_anchor_default } from "@/db/schema/account-anchor-default";
import { schedule_override } from "@/db/schema/schedule-override";
import { daily_schedule_segment } from "@/db/schema/daily-schedule";
import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { attributeRow } from "./attribute";
import { notifyDingtalk } from "@/lib/notify";

export async function runAttributionJob(opts?: { batch_id?: string; max_rows?: number }) {
  try {
    return await _runAttributionJobInner(opts);
  } catch (e) {
    await notifyDingtalk({
      title: "归因 job 报错",
      detail: `runAttributionJob failed\n${e instanceof Error ? (e.stack ?? e.message) : String(e)}`,
      context: { opts: JSON.stringify(opts) },
    }).catch((notifyErr: unknown) => {
      console.error("[attribution] notify failed:", notifyErr);
    });
    throw e;
  }
}

async function _runAttributionJobInner(opts?: { batch_id?: string; max_rows?: number }) {
  const maxRows = opts?.max_rows ?? 1000;

  const dirtyRows = await db
    .select({
      id: placement_row.id,
      date: placement_row.date,
      hour: placement_row.hour,
      live_account_id: placement_row.live_account_id,
    })
    .from(placement_row)
    .where(
      opts?.batch_id
        ? and(
            eq(placement_row.attribution_dirty, true),
            eq(placement_row.import_batch_id, opts.batch_id),
          )
        : eq(placement_row.attribution_dirty, true),
    )
    .limit(maxRows);

  if (dirtyRows.length === 0) return { processed: 0 };

  // 按 (account_id, date) 分组
  const groups = new Map<string, { account_id: string; date: string; rows: typeof dirtyRows }>();
  for (const r of dirtyRows) {
    const k = `${r.live_account_id}|${r.date}`;
    if (!groups.has(k)) groups.set(k, { account_id: r.live_account_id, date: r.date, rows: [] });
    const grp = groups.get(k);
    if (grp) grp.rows.push(r);
  }

  let processed = 0;
  for (const g of groups.values()) {
    const dailySegments = await db
      .select({
        user: daily_schedule_segment.dingtalk_user_id,
        start_hour: daily_schedule_segment.start_hour,
        end_hour: daily_schedule_segment.end_hour,
        is_rest: daily_schedule_segment.is_rest,
      })
      .from(daily_schedule_segment)
      .where(
        and(
          eq(daily_schedule_segment.account_id, g.account_id),
          eq(daily_schedule_segment.date, g.date),
        ),
      );

    let defaults: { user: string; slots: [string, string][]; rest_days: number[] }[];
    let overrides: { user: string; slots: [string, string][] }[];

    if (dailySegments.length > 0) {
      defaults = [];
      const byUser = new Map<string, [string, string][]>();
      for (const segment of dailySegments) {
        if (segment.is_rest) continue;
        const slot: [string, string] = [
          `${segment.start_hour.toString().padStart(2, "0")}:00`,
          `${segment.end_hour.toString().padStart(2, "0")}:00`,
        ];
        const existing = byUser.get(segment.user);
        if (existing) existing.push(slot);
        else byUser.set(segment.user, [slot]);
      }
      overrides = [...byUser.entries()].map(([user, slots]) => ({ user, slots }));
    } else {
      // 查 default — 必须按 effective_from / effective_to 过滤
      defaults = (
        await db
          .select({
            user: account_anchor_default.dingtalk_user_id,
            slots: account_anchor_default.time_slots,
            rest_days: account_anchor_default.rest_days,
          })
          .from(account_anchor_default)
          .where(
            and(
              eq(account_anchor_default.account_id, g.account_id),
              lte(account_anchor_default.effective_from, g.date),
              or(
                isNull(account_anchor_default.effective_to),
                gte(account_anchor_default.effective_to, g.date),
              ),
            ),
          )
      ).map((d) => ({
        user: d.user,
        slots: (d.slots ?? []) as [string, string][],
        rest_days: (d.rest_days ?? []) as number[],
      }));

      overrides = (
        await db
          .select({
            user: schedule_override.dingtalk_user_id,
            slots: schedule_override.time_slots,
          })
          .from(schedule_override)
          .where(
            and(eq(schedule_override.account_id, g.account_id), eq(schedule_override.date, g.date)),
          )
      ).map((o) => ({ user: o.user, slots: (o.slots ?? []) as [string, string][] }));
    }

    for (const row of g.rows) {
      const result = attributeRow({
        date: g.date,
        hour: row.hour,
        defaults,
        overrides,
      });

      await db
        .update(placement_row)
        .set({
          attributed_dingtalk_user_id: result.user,
          attribution_source: result.source,
          attribution_dirty: false,
          attribution_computed_at: sql`now()`,
        })
        .where(eq(placement_row.id, row.id));
      processed++;
    }
  }

  return { processed };
}
