"use server";

import { db } from "@/db/client";
import { daily_schedule_segment } from "@/db/schema/daily-schedule";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { markDirtyByAccountDate, runAttributionJob } from "@/modules/placement-attribution/server";
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

function sameSlot(a: [string, string], b: [string, string]) {
  return a[0] === b[0] && a[1] === b[1];
}

function rowSlot(row: { start_hour: number; end_hour: number }): [string, string] {
  return [
    `${row.start_hour.toString().padStart(2, "0")}:00`,
    `${row.end_hour.toString().padStart(2, "0")}:00`,
  ];
}

async function requireUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("UNAUTHORIZED");
  return session.user.id;
}

async function touchSchedule(account_id: string, date: string) {
  await markDirtyByAccountDate(account_id, date);
  await runAttributionJob({ max_rows: 200 });
  revalidatePath("/live-accounts/schedule-today");
  revalidatePath("/placements");
}

async function insertSegments(input: SaveOverrideInput, createdBy: string, source = "manual") {
  if (input.time_slots.length === 0) return;

  await db.insert(daily_schedule_segment).values(
    input.time_slots.map(([start, end]) => ({
      account_id: input.account_id,
      date: input.date,
      dingtalk_user_id: input.dingtalk_user_id,
      start_hour: parseHour(start),
      end_hour: parseHour(end),
      is_rest: input.is_rest ?? false,
      source,
      reason: input.reason ?? null,
      created_by: createdBy,
    })),
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
  await db
    .delete(daily_schedule_segment)
    .where(
      and(
        eq(daily_schedule_segment.account_id, account_id),
        eq(daily_schedule_segment.date, date),
        eq(daily_schedule_segment.dingtalk_user_id, user_id),
        eq(daily_schedule_segment.start_hour, parseHour(slot[0])),
        eq(daily_schedule_segment.end_hour, parseHour(slot[1])),
      ),
    );
}

export async function saveTodayOverride(input: SaveOverrideInput) {
  const userId = await requireUserId();

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
  const userId = await requireUserId();
  const nextSlot = input.time_slots[0];
  if (!nextSlot) throw new Error("MISSING_SLOT");

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
  const userId = await requireUserId();
  const nextSlot = input.time_slots[0];
  if (!nextSlot) throw new Error("MISSING_SLOT");

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
  const userId = await requireUserId();
  const slot = input.time_slots[0];
  if (!slot) throw new Error("MISSING_SLOT");

  const existing = await listUserSegments(input.account_id, input.date, input.dingtalk_user_id);
  if (!existing.some((row) => sameSlot(rowSlot(row), slot))) {
    await insertSegments(input, userId);
  }

  await touchSchedule(input.account_id, input.date);
}

export async function clearOneOverride(segment_id: string) {
  await requireUserId();

  const [removed] = await db
    .delete(daily_schedule_segment)
    .where(eq(daily_schedule_segment.id, segment_id))
    .returning();

  if (removed) await touchSchedule(removed.account_id, removed.date);
}

export async function copyYesterdayOverrides(today: string) {
  const userId = await requireUserId();
  const yesterday = new Date(today + "T12:00:00Z");
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const yesterdayRows = await db
    .select()
    .from(daily_schedule_segment)
    .where(eq(daily_schedule_segment.date, yesterdayStr));

  if (yesterdayRows.length === 0) return { copied: 0 };

  await db.delete(daily_schedule_segment).where(eq(daily_schedule_segment.date, today));
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
  const userId = await requireUserId();

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
      input.segments.map((segment) => ({
        account_id: input.account_id,
        date: input.date,
        dingtalk_user_id: segment.dingtalk_user_id,
        start_hour: parseHour(segment.time_slot[0]),
        end_hour: parseHour(segment.time_slot[1]),
        is_rest: segment.is_rest,
        source: segment.source ?? "manual",
        reason: segment.reason,
        created_by: userId,
      })),
    );
  }

  await touchSchedule(input.account_id, input.date);
}

export async function clearAllTodayOverrides(date: string) {
  await requireUserId();

  const removed = await db
    .delete(daily_schedule_segment)
    .where(eq(daily_schedule_segment.date, date))
    .returning();

  for (const accountId of [...new Set(removed.map((row) => row.account_id))]) {
    await markDirtyByAccountDate(accountId, date);
  }
  if (removed.length > 0) await runAttributionJob({ max_rows: 500 });

  revalidatePath("/live-accounts/schedule-today");
  revalidatePath("/placements");
  return { cleared: removed.length };
}
