/**
 * Integration: 绩效结果确认的连带效果（转正 / 季度汇总）
 *
 * 回归：72h 自动确认曾只改 stage，不触发转正与季度父周期汇总；季度分固定 /3 导致中途转正压分。
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/people-performance/notify", () => ({ notifyCycleStage: vi.fn() }));

import { db } from "@/db/client";
import {
  dingtalk_user,
  people_performance_profile,
  performance_cycle,
  performance_event,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import {
  autoConfirmExpiredPerformanceResults,
  summarizePendingQuarters,
} from "@/modules/people-performance/server";

const USER_ID = "test-perf-confirm-effects-001";
const QUARTER_ID = "test-perf-q-2026q2";
const MONTH_MAY = "test-perf-m-2026-05";
const MONTH_JUN = "test-perf-m-2026-06";
const PROBATION_ID = "test-perf-probation-1";
const ALL_IDS = [QUARTER_ID, MONTH_MAY, MONTH_JUN, PROBATION_ID];
const STALE = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);

async function cleanup(): Promise<void> {
  await db.delete(performance_event).where(inArray(performance_event.cycle_id, ALL_IDS));
  await db.delete(performance_cycle).where(inArray(performance_cycle.id, ALL_IDS));
  await db
    .delete(people_performance_profile)
    .where(eq(people_performance_profile.user_id, USER_ID));
  await db.delete(dingtalk_user).where(eq(dingtalk_user.user_id, USER_ID));
}

async function seedUser(): Promise<void> {
  await db
    .insert(dingtalk_user)
    .values({ user_id: USER_ID, unionid: `${USER_ID}_u`, name: "测试-绩效确认", raw: {} });
  await db.insert(people_performance_profile).values({ user_id: USER_ID, hire_date: "2026-03-01" });
}

async function seedQuarter(secondMonthStage: "employee_confirm" | "completed"): Promise<void> {
  // 季度中途转正：Q2 只有 5、6 两个月度周期
  const rows: (typeof performance_cycle.$inferInsert)[] = [
    {
      id: QUARTER_ID,
      user_id: USER_ID,
      kind: "quarterly",
      label: "2026Q2",
      period_start: "2026-04-01",
      period_end: "2026-06-30",
      stage: "in_progress",
    },
    {
      id: MONTH_MAY,
      user_id: USER_ID,
      parent_cycle_id: QUARTER_ID,
      kind: "monthly",
      label: "5月",
      period_start: "2026-05-01",
      period_end: "2026-05-31",
      stage: "completed",
      final_score: "90",
    },
    {
      id: MONTH_JUN,
      user_id: USER_ID,
      parent_cycle_id: QUARTER_ID,
      kind: "monthly",
      label: "6月",
      period_start: "2026-06-01",
      period_end: "2026-06-30",
      stage: secondMonthStage,
      final_score: "90",
      updated_at: STALE,
    },
  ];
  await db.insert(performance_cycle).values(rows);
}

async function getCycle(id: string) {
  const [row] = await db.select().from(performance_cycle).where(eq(performance_cycle.id, id));
  return row;
}

beforeEach(async () => {
  await cleanup();
  await seedUser();
});
afterAll(cleanup);

describe("performance confirm effects", () => {
  it("auto-confirm summarizes the quarterly parent, averaging actual months", async () => {
    await seedQuarter("employee_confirm");
    expect(await autoConfirmExpiredPerformanceResults()).toBeGreaterThanOrEqual(1);

    expect((await getCycle(MONTH_JUN))?.stage).toBe("completed");
    const quarter = await getCycle(QUARTER_ID);
    expect(quarter?.stage).toBe("completed");
    expect(Number(quarter?.final_score)).toBe(90); // 以前固定 /3 → 60（C）
    expect(quarter?.final_grade).toBe("S");
  });

  it("auto-confirm regularizes after the final passed probation cycle", async () => {
    await db.insert(performance_cycle).values({
      id: PROBATION_ID,
      user_id: USER_ID,
      kind: "probation",
      label: "试用期",
      sequence: 1,
      period_start: "2026-03-01",
      period_end: "2026-04-30",
      stage: "employee_confirm",
      probation_result: "passed",
      final_score: "85",
      updated_at: STALE,
    });
    await autoConfirmExpiredPerformanceResults();

    const [profile] = await db
      .select()
      .from(people_performance_profile)
      .where(eq(people_performance_profile.user_id, USER_ID));
    expect(profile?.employment_status).toBe("regular");
    expect(profile?.regularized_at).not.toBeNull();
  });

  it("sweep catch-up summarizes quarters left behind by the old auto-confirm", async () => {
    await seedQuarter("completed"); // 子周期都已完成，但父周期未汇总（历史遗留）
    expect(await summarizePendingQuarters("2026-10-08")).toBeGreaterThanOrEqual(1);
    const quarter = await getCycle(QUARTER_ID);
    expect(quarter?.stage).toBe("completed");
    expect(Number(quarter?.final_score)).toBe(90);

    // 幂等：再跑不重复处理
    await summarizePendingQuarters("2026-10-08");
    expect((await getCycle(QUARTER_ID))?.stage).toBe("completed");
  });
});
