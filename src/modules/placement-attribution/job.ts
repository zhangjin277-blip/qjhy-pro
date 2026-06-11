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

/**
 * 内部分批循环：每轮最多取 max_rows（默认 1000）条 dirty 行处理，
 * 直到当前过滤条件下没有剩余 dirty 行——调用方不需要再自己循环。
 * （历史坑：单轮 LIMIT 截断后剩余行要等次日 04:00 cron，主播聚合一直显示 0）
 */
async function _runAttributionJobInner(opts?: { batch_id?: string; max_rows?: number }) {
  const batchSize = opts?.max_rows ?? 1000;
  let processed = 0;
  while (true) {
    const batch = await processDirtyBatch(opts?.batch_id, batchSize);
    processed += batch.processed;
    // selected=0 才算清空。processed=0 但 selected>0 说明这批行被并发 job
    // 抢先处理掉了（写回守卫没命中），继续下一轮重新 SELECT 直到确认无剩余。
    if (batch.selected === 0) break;
  }
  return { processed };
}

/** 处理一批 dirty 行；返回本轮 SELECT 到的行数与真正完成写回的行数。 */
async function processDirtyBatch(
  batchId: string | undefined,
  batchSize: number,
): Promise<{ selected: number; processed: number }> {
  const dirtyRows = await db
    .select({
      id: placement_row.id,
      date: placement_row.date,
      hour: placement_row.hour,
      live_account_id: placement_row.live_account_id,
    })
    .from(placement_row)
    .where(
      batchId
        ? and(eq(placement_row.attribution_dirty, true), eq(placement_row.import_batch_id, batchId))
        : eq(placement_row.attribution_dirty, true),
    )
    // 稳定顺序：无 ORDER BY 时 LIMIT 取行随机，分批循环可能反复跳行
    .orderBy(placement_row.date, placement_row.hour, placement_row.id)
    .limit(batchSize);

  if (dirtyRows.length === 0) return { selected: 0, processed: 0 };

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

      // 防 lost update：只在行仍是 dirty 时写回。SELECT 后若用户改了排班
      // （markDirty 重新置脏 + 并发 job 用新排班算完置 dirty=false），
      // 本次基于旧排班的结果守卫不命中，直接丢弃，避免旧结果覆盖新归因。
      const updated = await db
        .update(placement_row)
        .set({
          attributed_dingtalk_user_id: result.user,
          attribution_source: result.source,
          attribution_dirty: false,
          attribution_computed_at: sql`now()`,
        })
        .where(and(eq(placement_row.id, row.id), eq(placement_row.attribution_dirty, true)))
        .returning({ id: placement_row.id });
      processed += updated.length;
    }
  }

  return { selected: dirtyRows.length, processed };
}
