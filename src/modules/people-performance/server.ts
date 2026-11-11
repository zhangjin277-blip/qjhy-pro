import "server-only";

import { and, asc, desc, eq, inArray, lte, lt, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db/client";
import {
  dingtalk_dept,
  dingtalk_user,
  live_anchor,
  people_performance_profile,
  performance_cycle,
  performance_event,
  performance_goal,
  user_position_override,
  type PerformanceGoalTemplate,
  type PeopleEmploymentStatus,
} from "@/db/schema";
import { AppError } from "@/lib/errors";

import { resolvePerformanceAccess } from "./authz";
import { isPerformanceActionAssignedToUser } from "./action-assignment";
import { selectCurrentCycle } from "./cycle-selection";
import {
  addDays,
  buildProbationPeriods,
  buildQuarterMonths,
  getQuarterPeriod,
  summarizeQuarter,
} from "./date-utils";
import {
  belongsToPerformanceDepartment,
  resolvePerformanceDepartmentIds,
} from "./department-filter";
import { notifyCycleStage } from "./notify";
import { visiblePerformanceRating } from "./rating";
import type {
  PeopleListRow,
  PerformanceManagerOption,
  PeoplePerformanceDetail,
  PerformanceCycleView,
  PerformanceEventView,
  PerformanceScoreStatisticsRow,
} from "./types";

const manager = alias(dingtalk_user, "performance_manager");
const skipManager = alias(dingtalk_user, "performance_skip_manager");

function numberOrNull(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function todayInShanghai(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function seedCycleGoals(cycleId: string, goals: PerformanceGoalTemplate[]): Promise<void> {
  if (goals.length === 0) return;
  await db.insert(performance_goal).values(
    goals.map((goal, index) => ({
      id: crypto.randomUUID(),
      cycle_id: cycleId,
      title: goal.title,
      description: goal.description,
      metric: goal.metric,
      target_value: goal.targetValue,
      weight: String(goal.weight),
      sort_order: index,
    })),
  );
}

export async function inheritMonthlyGoals(
  cycleId: string,
  userId: string,
  periodStart: string,
  fallback: PerformanceGoalTemplate[],
): Promise<void> {
  await db.transaction(async (tx) => {
    // Lock the cycle so concurrent sweeps cannot seed the same blank month twice.
    const [cycle] = await tx
      .select()
      .from(performance_cycle)
      .where(eq(performance_cycle.id, cycleId))
      .for("update");
    if (!cycle || !["scheduled", "goal_setting"].includes(cycle.stage)) return;
    const existing = await tx
      .select({ id: performance_goal.id })
      .from(performance_goal)
      .where(eq(performance_goal.cycle_id, cycleId))
      .limit(1);
    if (existing.length > 0) return;
    const previous = await tx
      .select({ id: performance_cycle.id })
      .from(performance_cycle)
      .where(
        and(
          eq(performance_cycle.user_id, userId),
          eq(performance_cycle.kind, "monthly"),
          lt(performance_cycle.period_start, periodStart),
          ne(performance_cycle.stage, "cancelled"),
        ),
      )
      .orderBy(desc(performance_cycle.period_start))
      .limit(1);
    const previousGoals = previous[0]
      ? await tx
          .select()
          .from(performance_goal)
          .where(eq(performance_goal.cycle_id, previous[0].id))
          .orderBy(asc(performance_goal.sort_order))
      : [];
    const goals =
      previousGoals.length > 0
        ? previousGoals.map((goal) => ({
            title: goal.title,
            description: goal.description,
            metric: goal.metric,
            targetValue: goal.target_value,
            weight: Number(goal.weight),
          }))
        : fallback;
    if (goals.length === 0) return;
    await tx.insert(performance_goal).values(
      goals.map((goal, index) => ({
        id: crypto.randomUUID(),
        cycle_id: cycleId,
        title: goal.title,
        description: goal.description,
        metric: goal.metric,
        target_value: goal.targetValue,
        weight: String(goal.weight),
        sort_order: index,
      })),
    );
  });
}

function canSeePerson(
  access: Awaited<ReturnType<typeof resolvePerformanceAccess>>,
  userId: string,
  managerUserId: string | null,
  skipManagerUserId: string | null,
): boolean {
  if (access.scope === "all" || access.manageProfiles || access.calibrate || access.manageAll) {
    return true;
  }
  if (userId === access.userId) return access.scope !== "none";
  return managerUserId === access.userId || skipManagerUserId === access.userId;
}

export async function listPeoplePerformance(): Promise<PeopleListRow[]> {
  const access = await resolvePerformanceAccess();
  if (access.scope === "none" && !access.manageProfiles && !access.calibrate && !access.manageAll) {
    return [];
  }

  const [people, departments, cycles] = await Promise.all([
    db
      .select({
        userId: dingtalk_user.user_id,
        name: dingtalk_user.name,
        title: sql<
          string | null
        >`COALESCE(${user_position_override.position}, NULLIF(${dingtalk_user.title}, ''))`,
        deptIds: dingtalk_user.dept_ids,
        managerUserId: people_performance_profile.manager_user_id,
        managerName: manager.name,
        skipManagerUserId: people_performance_profile.skip_manager_user_id,
        skipManagerName: skipManager.name,
        hireDate: people_performance_profile.hire_date,
        employmentStatus: people_performance_profile.employment_status,
        probationMonths: people_performance_profile.probation_months,
      })
      .from(dingtalk_user)
      .leftJoin(live_anchor, eq(live_anchor.dingtalk_user_id, dingtalk_user.user_id))
      .leftJoin(user_position_override, eq(user_position_override.user_id, dingtalk_user.user_id))
      .leftJoin(
        people_performance_profile,
        eq(people_performance_profile.user_id, dingtalk_user.user_id),
      )
      .leftJoin(manager, eq(manager.user_id, people_performance_profile.manager_user_id))
      .leftJoin(
        skipManager,
        eq(skipManager.user_id, people_performance_profile.skip_manager_user_id),
      )
      .where(
        and(
          eq(dingtalk_user.active, true),
          eq(dingtalk_user.is_external, false),
          sql`COALESCE(${user_position_override.position}, NULLIF(${dingtalk_user.title}, ''), CASE WHEN ${live_anchor.dingtalk_user_id} IS NOT NULL THEN '主播' ELSE '' END) <> '主播'`,
        ),
      )
      .orderBy(asc(dingtalk_user.name))
      .limit(1000),
    db
      .select({
        id: dingtalk_dept.dept_id,
        name: dingtalk_dept.name,
        parentId: dingtalk_dept.parent_id,
      })
      .from(dingtalk_dept),
    db
      .select({
        id: performance_cycle.id,
        userId: performance_cycle.user_id,
        label: performance_cycle.label,
        kind: performance_cycle.kind,
        stage: performance_cycle.stage,
        periodEnd: performance_cycle.period_end,
        periodStart: performance_cycle.period_start,
        managerUserId: performance_cycle.manager_user_id,
        skipManagerUserId: performance_cycle.skip_manager_user_id,
      })
      .from(performance_cycle)
      .where(ne(performance_cycle.kind, "quarterly"))
      .orderBy(desc(performance_cycle.period_start)),
  ]);

  const deptMap = new Map(departments.map((dept) => [dept.id, dept.name]));
  const allowedDepartmentIds = resolvePerformanceDepartmentIds(departments);
  const cyclesByUser = new Map<string, (typeof cycles)[number][]>();
  for (const cycle of cycles) {
    const items = cyclesByUser.get(cycle.userId) ?? [];
    items.push(cycle);
    cyclesByUser.set(cycle.userId, items);
  }

  return people
    .filter(
      (person) =>
        belongsToPerformanceDepartment(person.deptIds, allowedDepartmentIds) &&
        canSeePerson(access, person.userId, person.managerUserId, person.skipManagerUserId),
    )
    .map((person) => {
      const cycle = selectCurrentCycle(
        cyclesByUser.get(person.userId) ?? [],
        person.employmentStatus,
        todayInShanghai(),
      );
      return {
        userId: person.userId,
        name: person.name,
        title: person.title,
        department: person.deptIds.map((id) => deptMap.get(id) ?? id).join(" / "),
        managerName: person.managerName,
        skipManagerName: person.skipManagerName,
        hireDate: person.hireDate,
        employmentStatus: person.employmentStatus,
        probationMonths: person.probationMonths,
        currentCycleId: cycle?.id ?? null,
        currentCycleLabel: cycle?.label ?? null,
        currentStage: cycle?.stage ?? null,
        periodEnd: cycle?.periodEnd ?? null,
        overdueDate: cycle ? addDays(cycle.periodEnd, cycle.kind === "monthly" ? 11 : 1) : null,
        needsMyAction: cycle
          ? isPerformanceActionAssignedToUser(access, {
              stage: cycle.stage,
              userId: cycle.userId,
              managerUserId: cycle.managerUserId,
              skipManagerUserId: cycle.skipManagerUserId,
            })
          : false,
      } satisfies PeopleListRow;
    });
}

export async function getPerformanceScoreStatistics(): Promise<PerformanceScoreStatisticsRow[]> {
  const people = await listPeoplePerformance();
  const userIds = people.map((person) => person.userId);
  if (userIds.length === 0) return [];

  const rows = await db
    .select({
      userId: performance_cycle.user_id,
      name: dingtalk_user.name,
      cycleId: performance_cycle.id,
      cycleLabel: performance_cycle.label,
      periodStart: performance_cycle.period_start,
      score: performance_cycle.final_score,
    })
    .from(performance_cycle)
    .innerJoin(dingtalk_user, eq(dingtalk_user.user_id, performance_cycle.user_id))
    .where(
      and(inArray(performance_cycle.user_id, userIds), ne(performance_cycle.kind, "quarterly")),
    )
    .orderBy(desc(performance_cycle.period_start), asc(dingtalk_user.name));

  return rows.map((row) => ({
    userId: row.userId,
    name: row.name,
    cycleId: row.cycleId,
    cycleLabel: row.cycleLabel,
    periodStart: row.periodStart,
    score: row.score === null ? null : Number(row.score),
  }));
}

export async function getPeoplePerformanceDetail(userId: string): Promise<PeoplePerformanceDetail> {
  const access = await resolvePerformanceAccess();
  const person = (await listPeoplePerformance()).find((row) => row.userId === userId);
  if (!person) throw new AppError("PERFORMANCE_PERSON_NOT_FOUND", "人员不存在或无权查看", 404);

  const [profileRows, cycleRows, managerRows] = await Promise.all([
    db
      .select()
      .from(people_performance_profile)
      .where(eq(people_performance_profile.user_id, userId)),
    db
      .select()
      .from(performance_cycle)
      .where(eq(performance_cycle.user_id, userId))
      .orderBy(desc(performance_cycle.period_start), desc(performance_cycle.sequence)),
    listPerformanceManagerOptions(),
  ]);
  const profile = profileRows[0];
  const cycleIds = cycleRows.map((cycle) => cycle.id);
  const [goalRows, eventRows] = await Promise.all([
    cycleIds.length
      ? db
          .select()
          .from(performance_goal)
          .where(inArray(performance_goal.cycle_id, cycleIds))
          .orderBy(asc(performance_goal.sort_order))
      : Promise.resolve([]),
    cycleIds.length && access.manageAll
      ? db
          .select({
            id: performance_event.id,
            cycleId: performance_event.cycle_id,
            actorName: dingtalk_user.name,
            eventType: performance_event.event_type,
            fromStage: performance_event.from_stage,
            toStage: performance_event.to_stage,
            payload: performance_event.payload,
            createdAt: performance_event.created_at,
          })
          .from(performance_event)
          .leftJoin(dingtalk_user, eq(dingtalk_user.user_id, performance_event.actor_user_id))
          .where(inArray(performance_event.cycle_id, cycleIds))
          .orderBy(desc(performance_event.created_at))
      : Promise.resolve([]),
  ]);

  const isEmployeeViewer = access.userId === userId;
  const cycles: PerformanceCycleView[] = cycleRows.map((cycle) => {
    // 试用期评级必须经 HR 校准后才能向员工本人展示。
    const canSeeCalibratedResult =
      cycle.kind !== "probation" ||
      !isEmployeeViewer ||
      (cycle.hr_user_id !== null && ["employee_confirm", "completed"].includes(cycle.stage));
    return {
      id: cycle.id,
      parentCycleId: cycle.parent_cycle_id,
      kind: cycle.kind,
      label: cycle.label,
      periodStart: cycle.period_start,
      periodEnd: cycle.period_end,
      stage: cycle.stage,
      managerUserId: cycle.manager_user_id,
      skipManagerUserId: cycle.skip_manager_user_id,
      requiresFinalReview: cycle.requires_final_review,
      selfSummary: cycle.self_summary,
      managerSummary: cycle.manager_summary,
      skipManagerSummary: cycle.skip_manager_summary,
      hrComment: cycle.hr_comment,
      finalScore: numberOrNull(cycle.final_score),
      finalGrade: visiblePerformanceRating(cycle, isEmployeeViewer),
      probationResult: canSeeCalibratedResult ? cycle.probation_result : null,
      confirmationDeadline:
        cycle.stage === "employee_confirm"
          ? new Date(cycle.updated_at.getTime() + 72 * 60 * 60 * 1000).toISOString()
          : null,
      goals: goalRows
        .filter((goal) => goal.cycle_id === cycle.id)
        .map((goal) => ({
          id: goal.id,
          title: goal.title,
          description: goal.description,
          metric: goal.metric,
          targetValue: goal.target_value,
          weight: Number(goal.weight),
          completion: goal.completion,
          selfScore: numberOrNull(goal.self_score),
          managerScore: numberOrNull(goal.manager_score),
          managerComment: goal.manager_comment,
          skipManagerScore: numberOrNull(goal.skip_manager_score),
          skipManagerComment: goal.skip_manager_comment,
        })),
    };
  });

  const events: PerformanceEventView[] = eventRows.map((event) => ({
    ...event,
    createdAt: event.createdAt.toISOString(),
  }));

  return {
    person,
    profile: {
      managerUserId: profile?.manager_user_id ?? null,
      skipManagerUserId: profile?.skip_manager_user_id ?? null,
      hireDate: profile?.hire_date ?? null,
      employmentStatus: profile?.employment_status ?? null,
      probationMonths: profile?.probation_months ?? null,
      regularizedAt: profile?.regularized_at ?? null,
    },
    cycles,
    events,
    managers: managerRows.filter((row) => row.userId !== userId),
    capabilities: {
      manageProfiles: access.manageProfiles,
      calibrate: access.calibrate,
      manageAll: access.manageAll,
      actorUserId: access.userId,
    },
  };
}

export async function listPerformanceManagerOptions(): Promise<PerformanceManagerOption[]> {
  return db
    .select({ userId: dingtalk_user.user_id, name: dingtalk_user.name })
    .from(dingtalk_user)
    .leftJoin(live_anchor, eq(live_anchor.dingtalk_user_id, dingtalk_user.user_id))
    .leftJoin(user_position_override, eq(user_position_override.user_id, dingtalk_user.user_id))
    .where(
      and(
        eq(dingtalk_user.active, true),
        eq(dingtalk_user.is_external, false),
        sql`COALESCE(${user_position_override.position}, NULLIF(${dingtalk_user.title}, ''), CASE WHEN ${live_anchor.dingtalk_user_id} IS NOT NULL THEN '主播' ELSE '' END) <> '主播'`,
      ),
    )
    .orderBy(asc(dingtalk_user.name));
}

export async function ensureProbationCycles(args: {
  userId: string;
  managerUserId: string;
  skipManagerUserId: string | null;
  hireDate: string;
  probationMonths: 2 | 3 | 6;
}): Promise<void> {
  const today = todayInShanghai();
  const [profile] = await db
    .select({ goals: people_performance_profile.probation_goal_template })
    .from(people_performance_profile)
    .where(eq(people_performance_profile.user_id, args.userId));
  for (const period of buildProbationPeriods(args.hireDate, args.probationMonths)) {
    const [inserted] = await db
      .insert(performance_cycle)
      .values({
        id: crypto.randomUUID(),
        user_id: args.userId,
        kind: "probation",
        label: period.label,
        period_start: period.start,
        period_end: period.end,
        sequence: period.sequence,
        stage: period.start <= today ? "goal_setting" : "scheduled",
        manager_user_id: args.managerUserId,
        skip_manager_user_id: null,
        requires_final_review: !(
          args.probationMonths === 6 &&
          (period.sequence === 1 || period.sequence === 2)
        ),
      })
      .onConflictDoNothing({
        target: [performance_cycle.user_id, performance_cycle.kind, performance_cycle.period_start],
      })
      .returning({ id: performance_cycle.id });
    if (inserted) await seedCycleGoals(inserted.id, profile?.goals ?? []);
  }
}

export async function ensureRegularQuarter(today: string): Promise<void> {
  const profiles = await db
    .select()
    .from(people_performance_profile)
    .where(eq(people_performance_profile.employment_status, "regular"));
  const quarter = getQuarterPeriod(today);
  const months = buildQuarterMonths(today);
  for (const profile of profiles) {
    if (!profile.manager_user_id) continue;
    await db
      .insert(performance_cycle)
      .values({
        id: crypto.randomUUID(),
        user_id: profile.user_id,
        kind: "quarterly",
        label: quarter.label,
        period_start: quarter.start,
        period_end: quarter.end,
        sequence: quarter.sequence,
        stage: "in_progress",
        manager_user_id: profile.manager_user_id,
        skip_manager_user_id: profile.skip_manager_user_id,
      })
      .onConflictDoNothing({
        target: [performance_cycle.user_id, performance_cycle.kind, performance_cycle.period_start],
      });
    const [parent] = await db
      .select({ id: performance_cycle.id })
      .from(performance_cycle)
      .where(
        and(
          eq(performance_cycle.user_id, profile.user_id),
          eq(performance_cycle.kind, "quarterly"),
          eq(performance_cycle.period_start, quarter.start),
        ),
      );
    for (const month of months) {
      if (month.end < today) continue;
      const [inserted] = await db
        .insert(performance_cycle)
        .values({
          id: crypto.randomUUID(),
          user_id: profile.user_id,
          parent_cycle_id: parent?.id ?? null,
          kind: "monthly",
          label: month.label,
          period_start: month.start,
          period_end: month.end,
          sequence: month.sequence,
          stage: month.start <= today ? "goal_setting" : "scheduled",
          manager_user_id: profile.manager_user_id,
          skip_manager_user_id: profile.skip_manager_user_id,
        })
        .onConflictDoNothing({
          target: [
            performance_cycle.user_id,
            performance_cycle.kind,
            performance_cycle.period_start,
          ],
        })
        .returning({ id: performance_cycle.id });
      const [existing] = inserted
        ? [inserted]
        : await db
            .select({ id: performance_cycle.id })
            .from(performance_cycle)
            .where(
              and(
                eq(performance_cycle.user_id, profile.user_id),
                eq(performance_cycle.kind, "monthly"),
                eq(performance_cycle.period_start, month.start),
              ),
            );
      if (existing)
        await inheritMonthlyGoals(
          existing.id,
          profile.user_id,
          month.start,
          profile.performance_goal_template,
        );
    }
  }
}

export async function runPerformanceSweep(): Promise<{
  opened: number;
  selfReviewsOpened: number;
  reminders: number;
  autoConfirmed: number;
}> {
  const today = todayInShanghai();
  const scheduled = await db
    .select()
    .from(performance_cycle)
    .where(
      and(eq(performance_cycle.stage, "scheduled"), lte(performance_cycle.period_start, today)),
    );
  let opened = 0;
  for (const cycle of scheduled) {
    const [updated] = await db
      .update(performance_cycle)
      .set({ stage: "goal_setting", updated_at: new Date() })
      .where(and(eq(performance_cycle.id, cycle.id), eq(performance_cycle.stage, "scheduled")))
      .returning();
    if (!updated) continue;
    opened++;
    await db.insert(performance_event).values({
      cycle_id: cycle.id,
      actor_user_id: null,
      event_type: "cycle_opened",
      from_stage: "scheduled",
      to_stage: "goal_setting",
    });
    await notifyCycleStage(cycle.id, "goal_setting", `stage:goal_setting`);
  }

  const due = await db
    .select()
    .from(performance_cycle)
    .where(
      and(
        eq(performance_cycle.stage, "in_progress"),
        lte(performance_cycle.period_end, today),
        // 季度父周期不走自评，由月度子周期全部确认后汇总（summarizeQuarterIfComplete）
        ne(performance_cycle.kind, "quarterly"),
      ),
    );
  let selfReviewsOpened = 0;
  for (const cycle of due) {
    if (cycle.period_end >= today) continue;
    const [updated] = await db
      .update(performance_cycle)
      .set({ stage: "self_review", updated_at: new Date() })
      .where(and(eq(performance_cycle.id, cycle.id), eq(performance_cycle.stage, "in_progress")))
      .returning();
    if (!updated) continue;
    selfReviewsOpened++;
    await db.insert(performance_event).values({
      cycle_id: cycle.id,
      actor_user_id: null,
      event_type: "self_review_opened",
      from_stage: "in_progress",
      to_stage: "self_review",
    });
    await notifyCycleStage(cycle.id, "self_review", `stage:self_review`);
  }
  let reminders = 0;
  const probationCycles = await db
    .select()
    .from(performance_cycle)
    .where(and(eq(performance_cycle.kind, "probation"), ne(performance_cycle.stage, "completed")));
  for (const cycle of probationCycles) {
    if (addDays(today, 10) !== cycle.period_end) continue;
    await notifyCycleStage(cycle.id, cycle.stage, `probation-due-10:${cycle.period_end}`);
    reminders++;
  }

  if (today.endsWith("-03")) {
    const selfReviewCycles = await db
      .select()
      .from(performance_cycle)
      .where(
        and(eq(performance_cycle.kind, "monthly"), eq(performance_cycle.stage, "self_review")),
      );
    for (const cycle of selfReviewCycles) {
      await notifyCycleStage(cycle.id, cycle.stage, `monthly-self-review:${today}`);
      reminders++;
    }
  }

  if (today.endsWith("-07")) {
    const managerReviewCycles = await db
      .select()
      .from(performance_cycle)
      .where(
        and(
          eq(performance_cycle.kind, "monthly"),
          inArray(performance_cycle.stage, ["manager_review", "skip_manager_review"]),
        ),
      );
    for (const cycle of managerReviewCycles) {
      await notifyCycleStage(cycle.id, cycle.stage, `monthly-manager-review:${today}`);
      reminders++;
    }
  }
  const autoConfirmed = await autoConfirmExpiredPerformanceResults();
  await summarizePendingQuarters(today);
  return { opened, selfReviewsOpened, reminders, autoConfirmed };
}

type PerformanceCycleRow = typeof performance_cycle.$inferSelect;

/**
 * 季度父周期汇总：月度子周期全部 completed 且季度已结束 → 父周期 completed + 平均分定级。
 * 幂等（只处理未 completed 的父周期）。
 */
async function summarizeQuarterIfComplete(parentCycleId: string, today: string): Promise<boolean> {
  const [parent] = await db
    .select({ stage: performance_cycle.stage, periodEnd: performance_cycle.period_end })
    .from(performance_cycle)
    .where(eq(performance_cycle.id, parentCycleId));
  if (!parent || parent.stage === "completed") return false;
  const children = await db
    .select({ stage: performance_cycle.stage, finalScore: performance_cycle.final_score })
    .from(performance_cycle)
    .where(eq(performance_cycle.parent_cycle_id, parentCycleId));
  const summary = summarizeQuarter(children, parent.periodEnd, today);
  if (!summary) return false;
  const now = new Date();
  const [updated] = await db
    .update(performance_cycle)
    .set({
      stage: "completed",
      final_score: String(summary.score),
      final_grade: summary.grade,
      completed_at: now,
      updated_at: now,
    })
    .where(and(eq(performance_cycle.id, parentCycleId), ne(performance_cycle.stage, "completed")))
    .returning({ id: performance_cycle.id });
  return Boolean(updated);
}

/** 补算历史遗漏：已结束但未汇总的季度父周期（例如此前自动确认未触发汇总的） */
export async function summarizePendingQuarters(today: string): Promise<number> {
  const pending = await db
    .select({ id: performance_cycle.id })
    .from(performance_cycle)
    .where(
      and(
        eq(performance_cycle.kind, "quarterly"),
        ne(performance_cycle.stage, "completed"),
        lte(performance_cycle.period_end, today),
      ),
    );
  let summarized = 0;
  for (const parent of pending) {
    if (await summarizeQuarterIfComplete(parent.id, today)) summarized++;
  }
  return summarized;
}

/**
 * 结果确认（员工手动确认 / 72h 自动确认）后的连带效果，两条路径必须共用：
 * - 试用期最后一期 passed → 转正
 * - 月度周期 → 尝试汇总季度父周期
 */
export async function applyConfirmedCycleEffects(
  cycle: PerformanceCycleRow,
): Promise<{ regularized: boolean }> {
  const today = todayInShanghai();
  let regularized = false;
  if (cycle.kind === "probation" && cycle.probation_result === "passed") {
    const probationCycles = await db
      .select({ sequence: performance_cycle.sequence })
      .from(performance_cycle)
      .where(
        and(eq(performance_cycle.user_id, cycle.user_id), eq(performance_cycle.kind, "probation")),
      );
    const finalSequence = Math.max(...probationCycles.map((item) => item.sequence));
    if (cycle.sequence === finalSequence) {
      await db
        .update(people_performance_profile)
        .set({ employment_status: "regular", regularized_at: today, updated_at: new Date() })
        .where(eq(people_performance_profile.user_id, cycle.user_id));
      regularized = true;
    }
  }
  if (cycle.kind === "monthly" && cycle.parent_cycle_id) {
    await summarizeQuarterIfComplete(cycle.parent_cycle_id, today);
  }
  return { regularized };
}

export async function autoConfirmExpiredPerformanceResults(): Promise<number> {
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const confirmable = await db
    .select({ id: performance_cycle.id })
    .from(performance_cycle)
    .where(
      and(
        eq(performance_cycle.stage, "employee_confirm"),
        lt(performance_cycle.updated_at, cutoff),
      ),
    );
  let autoConfirmed = 0;
  for (const cycle of confirmable) {
    const [updated] = await db
      .update(performance_cycle)
      .set({
        stage: "completed",
        confirmed_at: new Date(),
        completed_at: new Date(),
        updated_at: new Date(),
      })
      .where(
        and(eq(performance_cycle.id, cycle.id), eq(performance_cycle.stage, "employee_confirm")),
      )
      .returning();
    if (!updated) continue;
    autoConfirmed++;
    await db.insert(performance_event).values({
      cycle_id: cycle.id,
      actor_user_id: null,
      event_type: "result_auto_confirmed",
      from_stage: "employee_confirm",
      to_stage: "completed",
      payload: { reason: "超过72小时未确认" },
    });
    // 转正后的周期由管理员手动创建，这里不递归调用 sweep
    await applyConfirmedCycleEffects(updated);
  }
  return autoConfirmed;
}

export type { PeopleEmploymentStatus };
