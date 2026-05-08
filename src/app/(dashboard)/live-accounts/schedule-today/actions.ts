"use server";
import { db } from "@/db/client";
import { account_anchor_default } from "@/db/schema/account-anchor-default";
import { schedule_override } from "@/db/schema/schedule-override";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { markDirtyByAccountDate, runAttributionJob } from "@/modules/placement-attribution/server";
import { revalidatePath } from "next/cache";

interface SaveOverrideInput {
  account_id: string;
  date: string;
  dingtalk_user_id: string;
  time_slots: [string, string][]; // []=休息
  reason?: string | null;
}

function sameSlot(a: [string, string], b: [string, string]) {
  return a[0] === b[0] && a[1] === b[1];
}

function isoWeekday(date: string): number {
  const dow = new Date(date + "T12:00:00Z").getUTCDay();
  return dow === 0 ? 7 : dow;
}

function uniqueSlots(slots: [string, string][]) {
  const result: [string, string][] = [];
  for (const slot of slots) {
    if (!result.some((existing) => sameSlot(existing, slot))) result.push(slot);
  }
  return result;
}

/**
 * 保存某账号某日某主播的 override：先删该 (account, date, user) 已有 override，再插新的。
 * 这样 popover 改主播多次点击不会留垃圾。
 */
export async function saveTodayOverride(input: SaveOverrideInput) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("UNAUTHORIZED");

  await db
    .delete(schedule_override)
    .where(
      and(
        eq(schedule_override.account_id, input.account_id),
        eq(schedule_override.date, input.date),
        eq(schedule_override.dingtalk_user_id, input.dingtalk_user_id),
      ),
    );

  await db.insert(schedule_override).values({
    account_id: input.account_id,
    date: input.date,
    dingtalk_user_id: input.dingtalk_user_id,
    time_slots: input.time_slots,
    reason: input.reason ?? null,
    created_by: session.user.id,
  });

  await markDirtyByAccountDate(input.account_id, input.date);
  await runAttributionJob({ max_rows: 200 });

  revalidatePath("/live-accounts/schedule-today");
  revalidatePath("/placements");
}

/**
 * 追加一个临时调班时段，不移动该主播原有 override 时段。
 * 用于复制粘贴：粘贴应该像复制一份，而不是把原排班剪切走。
 */
export async function appendTodayOverrideSlot(input: SaveOverrideInput) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("UNAUTHORIZED");

  const slot = input.time_slots[0];
  if (!slot) throw new Error("MISSING_SLOT");

  const [existing] = await db
    .select()
    .from(schedule_override)
    .where(
      and(
        eq(schedule_override.account_id, input.account_id),
        eq(schedule_override.date, input.date),
        eq(schedule_override.dingtalk_user_id, input.dingtalk_user_id),
      ),
    );

  if (existing) {
    const currentSlots = existing.time_slots ?? [];
    const nextSlots =
      currentSlots.length === 0 || currentSlots.some((current) => sameSlot(current, slot))
        ? currentSlots.length === 0
          ? [slot]
          : currentSlots
        : [...currentSlots, slot];

    await db
      .update(schedule_override)
      .set({
        time_slots: nextSlots,
        reason: input.reason ?? existing.reason,
      })
      .where(eq(schedule_override.id, existing.id));
  } else {
    const [defaultBinding] = await db
      .select({
        time_slots: account_anchor_default.time_slots,
        rest_days: account_anchor_default.rest_days,
      })
      .from(account_anchor_default)
      .where(
        and(
          eq(account_anchor_default.account_id, input.account_id),
          eq(account_anchor_default.dingtalk_user_id, input.dingtalk_user_id),
          sql`${account_anchor_default.effective_from} <= ${input.date}::date`,
          or(
            isNull(account_anchor_default.effective_to),
            sql`${account_anchor_default.effective_to} >= ${input.date}::date`,
          ),
        ),
      );

    const restDays = defaultBinding?.rest_days ?? [];
    const defaultSlots = restDays.includes(isoWeekday(input.date))
      ? []
      : (defaultBinding?.time_slots ?? []);

    await db.insert(schedule_override).values({
      account_id: input.account_id,
      date: input.date,
      dingtalk_user_id: input.dingtalk_user_id,
      time_slots: uniqueSlots([...defaultSlots, slot]),
      reason: input.reason ?? null,
      created_by: session.user.id,
    });
  }

  await markDirtyByAccountDate(input.account_id, input.date);
  await runAttributionJob({ max_rows: 200 });

  revalidatePath("/live-accounts/schedule-today");
  revalidatePath("/placements");
}

/**
 * 删某条 override（恢复成默认排班）。
 */
export async function clearOneOverride(override_id: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("UNAUTHORIZED");

  const [removed] = await db
    .delete(schedule_override)
    .where(eq(schedule_override.id, override_id))
    .returning();

  if (removed) {
    await markDirtyByAccountDate(removed.account_id, removed.date);
    await runAttributionJob({ max_rows: 200 });
  }

  revalidatePath("/live-accounts/schedule-today");
  revalidatePath("/placements");
}

/**
 * 把昨日所有 override 复制到今天（用于"今天延续昨天的临时调班"）。
 */
export async function copyYesterdayOverrides(today: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("UNAUTHORIZED");

  const yesterday = new Date(today + "T12:00:00Z");
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const yesterdayRows = await db
    .select()
    .from(schedule_override)
    .where(eq(schedule_override.date, yesterdayStr));

  if (yesterdayRows.length === 0) return { copied: 0 };

  // 清掉今天对应同 (account, user) 的，再批量插
  for (const r of yesterdayRows) {
    await db
      .delete(schedule_override)
      .where(
        and(
          eq(schedule_override.account_id, r.account_id),
          eq(schedule_override.date, today),
          eq(schedule_override.dingtalk_user_id, r.dingtalk_user_id),
        ),
      );
  }

  await db.insert(schedule_override).values(
    yesterdayRows.map((r) => ({
      account_id: r.account_id,
      date: today,
      dingtalk_user_id: r.dingtalk_user_id,
      time_slots: r.time_slots,
      reason: r.reason,
      created_by: session.user.id,
    })),
  );

  // 重新标脏 + 归因
  const dirtyAccountIds = [...new Set(yesterdayRows.map((r) => r.account_id))];
  for (const accId of dirtyAccountIds) {
    await markDirtyByAccountDate(accId, today);
  }
  await runAttributionJob({ max_rows: 500 });

  revalidatePath("/live-accounts/schedule-today");
  revalidatePath("/placements");
  return { copied: yesterdayRows.length };
}

/**
 * 批量替换某 (account, date) 所有 override（用于撤销/恢复，整体回滚）。
 * 先删该 account-date 的所有 override，再批量插 input.overrides。
 */
export async function replaceAccountDateOverrides(input: {
  account_id: string;
  date: string;
  overrides: {
    dingtalk_user_id: string;
    time_slots: [string, string][];
    reason: string | null;
  }[];
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("UNAUTHORIZED");

  await db
    .delete(schedule_override)
    .where(
      and(
        eq(schedule_override.account_id, input.account_id),
        eq(schedule_override.date, input.date),
      ),
    );

  if (input.overrides.length > 0) {
    await db.insert(schedule_override).values(
      input.overrides.map((o) => ({
        account_id: input.account_id,
        date: input.date,
        dingtalk_user_id: o.dingtalk_user_id,
        time_slots: o.time_slots,
        reason: o.reason,
        created_by: session.user.id,
      })),
    );
  }

  await markDirtyByAccountDate(input.account_id, input.date);
  await runAttributionJob({ max_rows: 200 });

  revalidatePath("/live-accounts/schedule-today");
  revalidatePath("/placements");
}

/**
 * 清空今天所有 override（恢复全部默认排班）。
 */
export async function clearAllTodayOverrides(date: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("UNAUTHORIZED");

  const removed = await db
    .delete(schedule_override)
    .where(eq(schedule_override.date, date))
    .returning();

  const dirtyAccountIds = [...new Set(removed.map((r) => r.account_id))];
  for (const accId of dirtyAccountIds) {
    await markDirtyByAccountDate(accId, date);
  }
  if (removed.length > 0) await runAttributionJob({ max_rows: 500 });

  revalidatePath("/live-accounts/schedule-today");
  revalidatePath("/placements");
  return { cleared: removed.length };
}
