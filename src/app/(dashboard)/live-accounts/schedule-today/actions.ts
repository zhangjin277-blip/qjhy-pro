"use server";

import { db } from "@/db/client";
import { daily_schedule_day, daily_schedule_segment } from "@/db/schema/daily-schedule";
import { auth } from "@/lib/auth";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { headers } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";
import { markDirtyByAccountDate, runAttributionJob } from "@/modules/placement-attribution/server";
import { resolvePermission } from "@/modules/permissions/server";
import { revalidatePath } from "next/cache";

interface SaveOverrideInput {
  account_id: string;
  date: string;
  dingtalk_user_id: string;
  time_slots: [string, string][];
  reason?: string | null;
  is_rest?: boolean;
}

interface ScheduleSnapshotInput {
  account_id: string;
  date: string;
  segments: {
    dingtalk_user_id: string;
    time_slot: [string, string];
    is_rest: boolean;
    reason: string | null;
    source?: string;
  }[];
}

function parseHour(t: string): number {
  return Number.parseInt(t.split(":")[0] ?? "0", 10);
}

function parseSlotHours(slot: [string, string]) {
  const startHour = parseHour(slot[0]);
  let endHour = parseHour(slot[1]);
  if (endHour <= startHour) endHour += 24;
  return { startHour, endHour };
}

function sameSlot(a: [string, string], b: [string, string]) {
  const slotA = parseSlotHours(a);
  const slotB = parseSlotHours(b);
  return slotA.startHour === slotB.startHour && slotA.endHour === slotB.endHour;
}

function rowSlot(row: { start_hour: number; end_hour: number }): [string, string] {
  return [
    `${row.start_hour.toString().padStart(2, "0")}:00`,
    `${row.end_hour.toString().padStart(2, "0")}:00`,
  ];
}

/**
 * 校验当前用户具备 live_account 模块写权限。
 *
 * - 未登录 → throw "UNAUTHORIZED"
 * - 已登录但钉钉未同步 → throw "AUTH_USER_NOT_SYNCED"
 * - emergency 后门 → 直接通过（admin 通道）
 * - 否则要求 resolvePermission(uid, "live_account").can_edit === true
 *
 * 返回 auth_user.id（用于 created_by 落库）。
 */
async function requireScheduleWrite() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("UNAUTHORIZED");
  const currentUser = await getCurrentDingtalkUser();
  if (currentUser.kind !== "ok") throw new Error("AUTH_USER_NOT_SYNCED");

  if (!currentUser.isEmergency) {
    const perm = await resolvePermission(currentUser.dingtalkUserId, "live_account");
    if (!perm.can_edit) throw new Error("FORBIDDEN");
  }
  return session.user.id;
}

async function touchSchedule(account_id: string, date: string) {
  await markDirtyByAccountDate(account_id, date);
  await runAttributionJob({ max_rows: 200 });
  revalidatePath("/live-accounts/schedule-today");
  revalidatePath("/placements");
}

async function ensureDayInitialized(account_id: string, date: string, createdBy: string | null) {
  await db
    .insert(daily_schedule_day)
    .values({ account_id, date, created_by: createdBy })
    .onConflictDoNothing();
}

async function ensureManyDaysInitialized(
  accountIds: string[],
  date: string,
  createdBy: string | null,
) {
  const uniqueAccountIds = [...new Set(accountIds)];
  if (uniqueAccountIds.length === 0) return;
  await db
    .insert(daily_schedule_day)
    .values(uniqueAccountIds.map((account_id) => ({ account_id, date, created_by: createdBy })))
    .onConflictDoNothing();
}

async function insertSegments(input: SaveOverrideInput, createdBy: string, source = "manual") {
  if (input.time_slots.length === 0) return;

  await db.insert(daily_schedule_segment).values(
    input.time_slots.map((slot) => {
      const { startHour, endHour } = parseSlotHours(slot);
      return {
        account_id: input.account_id,
        date: input.date,
        dingtalk_user_id: input.dingtalk_user_id,
        start_hour: startHour,
        end_hour: endHour,
        is_rest: input.is_rest ?? false,
        source,
        reason: input.reason ?? null,
        created_by: createdBy,
      };
    }),
  );
}

async function listUserSegments(account_id: string, date: string, user_id: string) {
  return db
    .select()
    .from(daily_schedule_segment)
    .where(
      and(
        eq(daily_schedule_segment.account_id, account_id),
        eq(daily_schedule_segment.date, date),
        eq(daily_schedule_segment.dingtalk_user_id, user_id),
      ),
    );
}

async function deleteSegmentBySlot(
  account_id: string,
  date: string,
  user_id: string,
  slot: [string, string],
) {
  const { startHour, endHour } = parseSlotHours(slot);
  await db
    .delete(daily_schedule_segment)
    .where(
      and(
        eq(daily_schedule_segment.account_id, account_id),
        eq(daily_schedule_segment.date, date),
        eq(daily_schedule_segment.dingtalk_user_id, user_id),
        eq(daily_schedule_segment.start_hour, startHour),
        eq(daily_schedule_segment.end_hour, endHour),
      ),
    );
}

export async function saveTodayOverride(input: SaveOverrideInput) {
  const userId = await requireScheduleWrite();

  await ensureDayInitialized(input.account_id, input.date, userId);
  await db
    .delete(daily_schedule_segment)
    .where(
      and(
        eq(daily_schedule_segment.account_id, input.account_id),
        eq(daily_schedule_segment.date, input.date),
        eq(daily_schedule_segment.dingtalk_user_id, input.dingtalk_user_id),
      ),
    );
  await insertSegments(input, userId);
  await touchSchedule(input.account_id, input.date);
}

export async function replaceTodaySegment(
  input: SaveOverrideInput & {
    from_dingtalk_user_id: string;
    from_time_slot: [string, string];
  },
) {
  const userId = await requireScheduleWrite();
  const nextSlot = input.time_slots[0];
  if (!nextSlot) throw new Error("MISSING_SLOT");

  await ensureDayInitialized(input.account_id, input.date, userId);
  await deleteSegmentBySlot(
    input.account_id,
    input.date,
    input.from_dingtalk_user_id,
    input.from_time_slot,
  );

  const targetRows = await listUserSegments(input.account_id, input.date, input.dingtalk_user_id);
  const alreadyExists = targetRows.some((row) => sameSlot(rowSlot(row), nextSlot));
  if (!alreadyExists) {
    await insertSegments(
      {
        account_id: input.account_id,
        date: input.date,
        dingtalk_user_id: input.dingtalk_user_id,
        time_slots: [nextSlot],
        reason: input.reason,
      },
      userId,
    );
  }

  await touchSchedule(input.account_id, input.date);
}

export async function resizeTodaySegment(
  input: SaveOverrideInput & {
    from_time_slot: [string, string];
  },
) {
  const userId = await requireScheduleWrite();
  const nextSlot = input.time_slots[0];
  if (!nextSlot) throw new Error("MISSING_SLOT");

  await ensureDayInitialized(input.account_id, input.date, userId);
  await deleteSegmentBySlot(
    input.account_id,
    input.date,
    input.dingtalk_user_id,
    input.from_time_slot,
  );
  await insertSegments(
    {
      account_id: input.account_id,
      date: input.date,
      dingtalk_user_id: input.dingtalk_user_id,
      time_slots: [nextSlot],
      reason: input.reason,
    },
    userId,
  );

  await touchSchedule(input.account_id, input.date);
}

export async function appendTodayOverrideSlot(input: SaveOverrideInput) {
  const userId = await requireScheduleWrite();
  const slot = input.time_slots[0];
  if (!slot) throw new Error("MISSING_SLOT");

  await ensureDayInitialized(input.account_id, input.date, userId);
  const existing = await listUserSegments(input.account_id, input.date, input.dingtalk_user_id);
  if (!existing.some((row) => sameSlot(rowSlot(row), slot))) {
    await insertSegments(input, userId);
  }

  await touchSchedule(input.account_id, input.date);
}

/**
 * 从今日排班移除某账号（删除该账号该日全部 segments + daily_schedule_day 记录）。
 * page render 时 daily_schedule_day 不存在 → seed 重新生成。所以再次访问会回来。
 * 用于"账号今日不播"的场景，仅当天清干净。
 */
export async function removeAccountFromToday(account_id: string, date: string) {
  await requireScheduleWrite();
  await db
    .delete(daily_schedule_segment)
    .where(
      and(eq(daily_schedule_segment.account_id, account_id), eq(daily_schedule_segment.date, date)),
    );
  await db
    .delete(daily_schedule_day)
    .where(and(eq(daily_schedule_day.account_id, account_id), eq(daily_schedule_day.date, date)));
  await touchSchedule(account_id, date);
}

export async function clearOneOverride(segment_id: string) {
  await requireScheduleWrite();

  const [removed] = await db
    .delete(daily_schedule_segment)
    .where(eq(daily_schedule_segment.id, segment_id))
    .returning();

  if (removed) await touchSchedule(removed.account_id, removed.date);
}

export async function copyYesterdayOverrides(today: string) {
  const userId = await requireScheduleWrite();
  const yesterday = new Date(today + "T12:00:00Z");
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const yesterdayRows = await db
    .select()
    .from(daily_schedule_segment)
    .where(eq(daily_schedule_segment.date, yesterdayStr));

  if (yesterdayRows.length === 0) return { copied: 0 };

  await db.delete(daily_schedule_segment).where(eq(daily_schedule_segment.date, today));
  await ensureManyDaysInitialized(
    yesterdayRows.map((row) => row.account_id),
    today,
    userId,
  );
  await db.insert(daily_schedule_segment).values(
    yesterdayRows.map((row) => ({
      account_id: row.account_id,
      date: today,
      dingtalk_user_id: row.dingtalk_user_id,
      start_hour: row.start_hour,
      end_hour: row.end_hour,
      is_rest: row.is_rest,
      source: "copied",
      reason: row.reason,
      created_by: userId,
    })),
  );

  for (const accountId of [...new Set(yesterdayRows.map((row) => row.account_id))]) {
    await markDirtyByAccountDate(accountId, today);
  }
  await runAttributionJob({ max_rows: 500 });

  revalidatePath("/live-accounts/schedule-today");
  revalidatePath("/placements");
  return { copied: yesterdayRows.length };
}

export async function replaceAccountDateSchedule(input: ScheduleSnapshotInput) {
  const userId = await requireScheduleWrite();

  await ensureDayInitialized(input.account_id, input.date, userId);
  await db
    .delete(daily_schedule_segment)
    .where(
      and(
        eq(daily_schedule_segment.account_id, input.account_id),
        eq(daily_schedule_segment.date, input.date),
      ),
    );

  if (input.segments.length > 0) {
    await db.insert(daily_schedule_segment).values(
      input.segments.map((segment) => {
        const { startHour, endHour } = parseSlotHours(segment.time_slot);
        return {
          account_id: input.account_id,
          date: input.date,
          dingtalk_user_id: segment.dingtalk_user_id,
          start_hour: startHour,
          end_hour: endHour,
          is_rest: segment.is_rest,
          source: segment.source ?? "manual",
          reason: segment.reason,
          created_by: userId,
        };
      }),
    );
  }

  await touchSchedule(input.account_id, input.date);
}

export async function clearAllTodayOverrides(date: string, accountIds?: string[]) {
  const userId = await requireScheduleWrite();

  // 强制要求 accountIds 非空——禁止"清全公司当天 segments"的全表 DELETE 路径。
  // 调用方必须显式传入可见账号集合（页面已根据 scope 过滤）。
  const visibleAccountIds = accountIds ? [...new Set(accountIds)] : [];
  if (visibleAccountIds.length === 0) {
    throw new Error("MISSING_ACCOUNT_IDS");
  }

  await ensureManyDaysInitialized(visibleAccountIds, date, userId);

  const removed = await db
    .delete(daily_schedule_segment)
    .where(
      and(
        eq(daily_schedule_segment.date, date),
        inArray(daily_schedule_segment.account_id, visibleAccountIds),
      ),
    )
    .returning();

  for (const accountId of visibleAccountIds) {
    await markDirtyByAccountDate(accountId, date);
  }
  await runAttributionJob({ max_rows: 500 });

  revalidatePath("/live-accounts/schedule-today");
  revalidatePath("/placements");
  return { cleared: removed.length };
}
