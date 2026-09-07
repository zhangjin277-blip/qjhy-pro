import "server-only";

import { and, asc, desc, eq, inArray, lte, ne, sql } from "drizzle-orm";
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
import { selectCurrentCycle } from "./cycle-selection";
import { buildProbationPeriods, buildQuarterMonths, getQuarterPeriod } from "./date-utils";
import {
  belongsToPerformanceDepartment,
  resolvePerformanceDepartmentIds,
} from "./department-filter";
import { notifyCycleStage } from "./notify";
import type {
  PeopleListRow,
  PerformanceManagerOption,
  PeoplePerformanceDetail,
  PerformanceCycleView,
  PerformanceEventView,
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
      } satisfies PeopleListRow;
    });
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
    cycleIds.length
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

  const cycles: PerformanceCycleView[] = cycleRows.map((cycle) => ({
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
    finalGrade: cycle.final_grade,
    probationResult: cycle.probation_result,
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
  }));

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
  probationMonths: 2 | 6;
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

async function ensureRegularQuarter(today: string): Promise<void> {
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
      if (inserted) {
        await seedCycleGoals(inserted.id, profile.performance_goal_template);
      }
    }
  }
}

export async function runPerformanceSweep(): Promise<{
  opened: number;
  selfReviewsOpened: number;
  reminders: number;
}> {
  const today = todayInShanghai();
  await ensureRegularQuarter(today);
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
      and(eq(performance_cycle.stage, "in_progress"), lte(performance_cycle.period_end, today)),
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
  if (today.endsWith("-01")) {
    const outstanding = await db
      .select()
      .from(performance_cycle)
      .where(
        inArray(performance_cycle.stage, [
          "goal_setting",
          "goal_review",
          "self_review",
          "manager_review",
          "skip_manager_review",
          "hr_calibration",
          "employee_confirm",
        ]),
      );
    for (const cycle of outstanding) {
      await notifyCycleStage(cycle.id, cycle.stage, `monthly-reminder:${today}`);
      reminders++;
    }
  }
  return { opened, selfReviewsOpened, reminders };
}

export type { PeopleEmploymentStatus };
