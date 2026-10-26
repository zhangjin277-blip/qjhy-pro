"use server";

import { and, eq, inArray, or } from "drizzle-orm";

import { db } from "@/db/client";
import {
  dingtalk_user,
  people_performance_profile,
  performance_cycle,
  performance_event,
  performance_goal,
  type PerformanceStage,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import { fetchUserDetail } from "@/lib/dingtalk";

import { resolvePerformanceAccess } from "./authz";
import {
  buildProbationPeriods,
  calculateReviewScore,
  calculateWeightedScore,
  dingtalkHireDate,
  addDays,
  addMonths,
  buildQuarterMonths,
  getQuarterPeriod,
  gradeForScore,
} from "./date-utils";
import { notifyCycleStage } from "./notify";
import {
  CalibrateInput,
  BulkConfigureProfilesInput,
  BulkOpenSelfReviewInput,
  CycleIdInput,
  CreateManualCycleInput,
  ManagerReviewInput,
  PersonIdInput,
  ReviewGoalsInput,
  ReturnPerformanceInput,
  SaveProfileInput,
  SelfReviewInput,
  SubmitGoalsInput,
} from "./schema";
import { canTransition } from "./state-machine";
import {
  applyConfirmedCycleEffects,
  ensureProbationCycles,
  getPeoplePerformanceDetail,
  inheritMonthlyGoals,
  runPerformanceSweep,
} from "./server";
import type { PeoplePerformanceDetail } from "./types";
import type { PerformanceGoalTemplate } from "@/db/schema";

export async function getPeoplePerformanceDetailAction(
  input: unknown,
): Promise<PeoplePerformanceDetail> {
  const data = PersonIdInput.parse(input);
  return getPeoplePerformanceDetail(data.userId);
}

export async function createPeoplePerformanceTemplate(): Promise<Buffer> {
  const access = await resolvePerformanceAccess();
  if (!access.manageProfiles) {
    throw new AppError("AUTH_FORBIDDEN", "无人员考核档案管理权限", 403);
  }
  const bulkImport = await import("./bulk-import");
  return bulkImport.createPeoplePerformanceTemplate();
}

export async function importPeoplePerformanceWorkbook(buffer: Buffer): Promise<{
  configured: number;
  failed: { name: string; reason: string }[];
}> {
  const bulkImport = await import("./bulk-import");
  return bulkImport.importPeoplePerformanceWorkbook(buffer);
}

export async function deletePerformanceCycle(input: unknown): Promise<{ ok: true }> {
  const data = CycleIdInput.parse(input);
  const [access, cycle] = await Promise.all([
    resolvePerformanceAccess(),
    requireCycle(data.cycleId),
  ]);
  if (!access.manageProfiles) {
    throw new AppError("AUTH_FORBIDDEN", "无删除考核周期权限", 403);
  }

  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(performance_cycle)
      .where(
        cycle.kind === "quarterly"
          ? or(eq(performance_cycle.id, cycle.id), eq(performance_cycle.parent_cycle_id, cycle.id))
          : eq(performance_cycle.id, cycle.id),
      )
      .returning({ id: performance_cycle.id });
    if (deleted.length === 0) {
      throw new AppError("PERFORMANCE_CYCLE_NOT_FOUND", "考核周期不存在", 404);
    }
  });
  return { ok: true };
}

export async function createManualPerformanceCycle(
  input: unknown,
): Promise<{ ok: true; cycleId: string }> {
  const data = CreateManualCycleInput.parse(input);
  const access = await resolvePerformanceAccess();
  if (!access.manageProfiles) throw new AppError("AUTH_FORBIDDEN", "无新增考核周期权限", 403);
  const [profile] = await db
    .select()
    .from(people_performance_profile)
    .where(eq(people_performance_profile.user_id, data.userId));
  if (!profile?.manager_user_id) {
    throw new AppError("PERFORMANCE_PROFILE_INCOMPLETE", "请先配置直属上级", 400);
  }
  const start =
    data.kind === "quarterly"
      ? getQuarterPeriod(data.periodStart).start
      : `${data.periodStart.slice(0, 7)}-01`;
  const period =
    data.kind === "quarterly"
      ? getQuarterPeriod(start)
      : {
          label: `${start.slice(0, 4)}年${Number(start.slice(5, 7))}月绩效`,
          start,
          end: addDays(addMonths(start, 1), -1),
          sequence: 1,
        };
  const [parent] = await db
    .insert(performance_cycle)
    .values({
      id: crypto.randomUUID(),
      user_id: data.userId,
      kind: data.kind,
      label: period.label,
      period_start: period.start,
      period_end: period.end,
      sequence: period.sequence,
      stage: "goal_setting",
      manager_user_id: profile.manager_user_id,
      skip_manager_user_id: profile.skip_manager_user_id,
    })
    .onConflictDoNothing({
      target: [performance_cycle.user_id, performance_cycle.kind, performance_cycle.period_start],
    })
    .returning({ id: performance_cycle.id });
  if (!parent) throw new AppError("PERFORMANCE_CYCLE_EXISTS", "该考核周期已存在", 409);
  if (data.kind === "monthly") {
    await inheritMonthlyGoals(
      parent.id,
      data.userId,
      period.start,
      profile.performance_goal_template,
    );
  } else {
    for (const month of buildQuarterMonths(period.start)) {
      const [child] = await db
        .insert(performance_cycle)
        .values({
          id: crypto.randomUUID(),
          user_id: data.userId,
          parent_cycle_id: parent.id,
          kind: "monthly",
          label: month.label,
          period_start: month.start,
          period_end: month.end,
          sequence: month.sequence,
          stage: "goal_setting",
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
      if (child)
        await inheritMonthlyGoals(
          child.id,
          data.userId,
          month.start,
          profile.performance_goal_template,
        );
    }
  }
  return { ok: true, cycleId: parent.id };
}

async function requireCycle(cycleId: string) {
  const [cycle] = await db
    .select()
    .from(performance_cycle)
    .where(eq(performance_cycle.id, cycleId));
  if (!cycle) throw new AppError("PERFORMANCE_CYCLE_NOT_FOUND", "考核周期不存在", 404);
  return cycle;
}

async function validateGoalScores(
  cycleId: string,
  scores: { id: string; score: number }[],
): Promise<void> {
  const goals = await db
    .select({ id: performance_goal.id, weight: performance_goal.weight })
    .from(performance_goal)
    .where(eq(performance_goal.cycle_id, cycleId));
  const weights = new Map(goals.map((goal) => [goal.id, Number(goal.weight)]));
  for (const item of scores) {
    const weight = weights.get(item.id);
    if (weight === undefined) {
      throw new AppError("PERFORMANCE_GOAL_NOT_FOUND", "考核目标不存在", 404);
    }
    if (item.score > weight) {
      throw new AppError(
        "PERFORMANCE_SCORE_EXCEEDS_WEIGHT",
        `单项目标评分不能超过该目标权重（${weight}分）`,
        400,
      );
    }
  }
  const total = scores.reduce((sum, item) => sum + item.score, 0);
  if (total > 100) {
    throw new AppError("PERFORMANCE_SCORE_EXCEEDS_TOTAL", "目标评分合计不能超过100分", 400);
  }
}

function assertStage(from: PerformanceStage, to: PerformanceStage): void {
  if (!canTransition(from, to)) {
    throw new AppError("PERFORMANCE_ILLEGAL_TRANSITION", `当前环节不能从 ${from} 进入 ${to}`, 409);
  }
}

function todayInShanghai(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function cycleProgressRank(stage: PerformanceStage): number {
  const order: PerformanceStage[] = [
    "scheduled",
    "goal_setting",
    "goal_review",
    "in_progress",
    "self_review",
    "manager_review",
    "skip_manager_review",
    "hr_calibration",
    "employee_confirm",
    "completed",
    "cancelled",
  ];
  return order.indexOf(stage);
}

/** Rebase existing probation cycles when the hire date is corrected.
 * Existing IDs and workflow data are preserved; duplicate historical rows are merged. */
async function reconcileProbationCycleDates(
  userId: string,
  hireDate: string,
  probationMonths: 2 | 6,
  managerUserId: string,
): Promise<void> {
  const periods = buildProbationPeriods(hireDate, probationMonths);
  const existing = await db
    .select()
    .from(performance_cycle)
    .where(and(eq(performance_cycle.user_id, userId), eq(performance_cycle.kind, "probation")));
  const bySequence = new Map<number, typeof existing>();
  for (const cycle of existing) {
    const items = bySequence.get(cycle.sequence) ?? [];
    items.push(cycle);
    bySequence.set(cycle.sequence, items);
  }

  await db.transaction(async (tx) => {
    for (const period of periods) {
      const candidates = [...(bySequence.get(period.sequence) ?? [])].sort(
        (a, b) =>
          cycleProgressRank(b.stage) - cycleProgressRank(a.stage) ||
          b.updated_at.getTime() - a.updated_at.getTime(),
      );
      const keep = candidates[0];
      if (!keep) continue;
      const duplicates = candidates.slice(1);
      if (duplicates.length > 0) {
        await tx.delete(performance_cycle).where(
          inArray(
            performance_cycle.id,
            duplicates.map((cycle) => cycle.id),
          ),
        );
      }
      await tx
        .update(performance_cycle)
        .set({
          label: period.label,
          period_start: period.start,
          period_end: period.end,
          manager_user_id: managerUserId,
          requires_final_review: !(
            probationMonths === 6 &&
            (period.sequence === 1 || period.sequence === 2)
          ),
          updated_at: new Date(),
        })
        .where(eq(performance_cycle.id, keep.id));
    }
  });
}

export async function syncPersonFromDingtalkRoster(input: unknown): Promise<{
  ok: true;
  hireDate: string | null;
}> {
  const data = PersonIdInput.parse(input);
  const access = await resolvePerformanceAccess();
  if (!access.manageProfiles) {
    throw new AppError("AUTH_FORBIDDEN", "无人员考核档案管理权限", 403);
  }
  const detail = await fetchUserDetail(data.userId);
  const [updated] = await db
    .update(dingtalk_user)
    .set({
      name: detail.name,
      mobile: detail.mobile ?? null,
      title: detail.title ?? null,
      dept_ids: (detail.dept_id_list ?? []).map(String),
      active: detail.active ?? true,
      raw: detail,
      synced_at: new Date(),
    })
    .where(eq(dingtalk_user.user_id, data.userId))
    .returning({ userId: dingtalk_user.user_id });
  if (!updated) throw new AppError("PERFORMANCE_PERSON_NOT_FOUND", "人员不存在", 404);
  return { ok: true, hireDate: dingtalkHireDate(detail.hired_date) };
}

export async function savePeopleProfile(input: unknown): Promise<{ ok: true }> {
  const data = SaveProfileInput.parse(input);
  const access = await resolvePerformanceAccess();
  if (!access.manageProfiles) {
    throw new AppError("AUTH_FORBIDDEN", "无人员考核档案管理权限", 403);
  }
  await db
    .insert(people_performance_profile)
    .values({
      user_id: data.userId,
      manager_user_id: data.managerUserId,
      skip_manager_user_id: data.skipManagerUserId,
      hire_date: data.hireDate,
      employment_status: data.employmentStatus,
      probation_months: data.probationMonths,
      regularized_at: data.regularizedAt ?? null,
      created_by_user_id: access.userId,
    })
    .onConflictDoUpdate({
      target: people_performance_profile.user_id,
      set: {
        manager_user_id: data.managerUserId,
        skip_manager_user_id: data.skipManagerUserId,
        hire_date: data.hireDate,
        employment_status: data.employmentStatus,
        probation_months: data.probationMonths,
        regularized_at: data.regularizedAt ?? null,
        updated_at: new Date(),
      },
    });

  await db
    .update(performance_cycle)
    .set({
      manager_user_id: data.managerUserId,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(performance_cycle.user_id, data.userId),
        inArray(performance_cycle.stage, [
          "scheduled",
          "goal_setting",
          "goal_review",
          "in_progress",
          "self_review",
          "manager_review",
          "skip_manager_review",
          "hr_calibration",
        ]),
      ),
    );
  await db
    .update(performance_cycle)
    .set({ skip_manager_user_id: null, updated_at: new Date() })
    .where(
      and(
        eq(performance_cycle.user_id, data.userId),
        eq(performance_cycle.kind, "probation"),
        inArray(performance_cycle.stage, [
          "scheduled",
          "goal_setting",
          "goal_review",
          "in_progress",
          "self_review",
          "manager_review",
          "skip_manager_review",
          "hr_calibration",
        ]),
      ),
    );
  await db
    .update(performance_cycle)
    .set({ skip_manager_user_id: data.skipManagerUserId, updated_at: new Date() })
    .where(
      and(
        eq(performance_cycle.user_id, data.userId),
        inArray(performance_cycle.kind, ["monthly", "quarterly"]),
        inArray(performance_cycle.stage, [
          "scheduled",
          "goal_setting",
          "goal_review",
          "in_progress",
          "self_review",
          "manager_review",
          "skip_manager_review",
          "hr_calibration",
        ]),
      ),
    );
  if (data.skipManagerUserId === null) {
    await advanceCyclesAfterSkipManagerRemoval(data.userId);
  }

  if (data.employmentStatus === "probation") {
    await reconcileProbationCycleDates(
      data.userId,
      data.hireDate,
      data.probationMonths,
      data.managerUserId,
    );
    await ensureProbationCycles({
      userId: data.userId,
      managerUserId: data.managerUserId,
      skipManagerUserId: data.skipManagerUserId,
      hireDate: data.hireDate,
      probationMonths: data.probationMonths,
    });
  } else if (data.employmentStatus === "regular") {
    await runPerformanceSweep();
  }
  return { ok: true };
}

async function replaceEditableCycleGoals(
  userId: string,
  kinds: ("probation" | "monthly")[],
  goals: PerformanceGoalTemplate[],
): Promise<void> {
  const cycles = await db
    .select({ id: performance_cycle.id })
    .from(performance_cycle)
    .where(
      and(
        eq(performance_cycle.user_id, userId),
        inArray(performance_cycle.kind, kinds),
        inArray(performance_cycle.stage, ["scheduled", "goal_setting"]),
      ),
    );
  if (cycles.length === 0) return;
  const cycleIds = cycles.map((cycle) => cycle.id);
  await db.transaction(async (tx) => {
    await tx.delete(performance_goal).where(inArray(performance_goal.cycle_id, cycleIds));
    if (goals.length > 0) {
      await tx.insert(performance_goal).values(
        cycles.flatMap((cycle) =>
          goals.map((goal, index) => ({
            id: crypto.randomUUID(),
            cycle_id: cycle.id,
            title: goal.title,
            description: goal.description,
            metric: goal.metric,
            target_value: goal.targetValue,
            weight: String(goal.weight),
            sort_order: index,
          })),
        ),
      );
    }
  });
}

async function advanceCyclesAfterSkipManagerRemoval(userId: string): Promise<void> {
  const advanced = await db
    .update(performance_cycle)
    .set({ stage: "hr_calibration", updated_at: new Date() })
    .where(
      and(
        eq(performance_cycle.user_id, userId),
        eq(performance_cycle.kind, "monthly"),
        eq(performance_cycle.stage, "skip_manager_review"),
      ),
    )
    .returning({ id: performance_cycle.id });
  for (const cycle of advanced) {
    await notifyCycleStage(cycle.id, "hr_calibration", `skip-manager-removed:${Date.now()}`);
  }
}

export async function bulkConfigurePeopleProfiles(input: unknown): Promise<{
  ok: true;
  configured: number;
  failed: { userId: string; name: string; reason: string }[];
}> {
  const data = BulkConfigureProfilesInput.parse(input);
  const access = await resolvePerformanceAccess();
  if (!access.manageProfiles) {
    throw new AppError("AUTH_FORBIDDEN", "无人员考核档案管理权限", 403);
  }
  const [people, profiles] = await Promise.all([
    db
      .select({
        userId: dingtalk_user.user_id,
        name: dingtalk_user.name,
        raw: dingtalk_user.raw,
      })
      .from(dingtalk_user)
      .where(inArray(dingtalk_user.user_id, data.userIds)),
    db
      .select()
      .from(people_performance_profile)
      .where(inArray(people_performance_profile.user_id, data.userIds)),
  ]);
  const profileByUserId = new Map(profiles.map((profile) => [profile.user_id, profile]));
  const peopleByUserId = new Map(people.map((person) => [person.userId, person]));
  const failed: { userId: string; name: string; reason: string }[] = [];
  const configuredUserIds: string[] = [];

  for (const userId of data.userIds) {
    const person = peopleByUserId.get(userId);
    if (!person) {
      failed.push({ userId, name: userId, reason: "人员不存在" });
      continue;
    }
    if (userId === data.managerUserId || userId === data.skipManagerUserId) {
      failed.push({ userId, name: person.name, reason: "上级不能是员工本人" });
      continue;
    }
    const existing = profileByUserId.get(userId);
    const raw = person.raw as { hired_date?: number | string | null };
    let hireDate = data.hireDateOverride ?? existing?.hire_date ?? dingtalkHireDate(raw.hired_date);
    if (!hireDate) {
      try {
        const detail = await fetchUserDetail(userId);
        hireDate = dingtalkHireDate(detail.hired_date);
        await db
          .update(dingtalk_user)
          .set({
            name: detail.name,
            mobile: detail.mobile ?? null,
            title: detail.title ?? null,
            dept_ids: (detail.dept_id_list ?? []).map(String),
            active: detail.active ?? true,
            raw: detail,
            synced_at: new Date(),
          })
          .where(eq(dingtalk_user.user_id, userId));
      } catch (error) {
        console.warn("[people-performance-bulk-roster-sync]", userId, error);
      }
    }
    if (!hireDate) {
      failed.push({ userId, name: person.name, reason: "钉钉花名册缺少入职日期" });
      continue;
    }
    const probationGoals = data.applyProbationGoals
      ? data.probationGoals
      : (existing?.probation_goal_template ?? []);
    const performanceGoals = data.applyPerformanceGoals
      ? data.performanceGoals
      : (existing?.performance_goal_template ?? []);
    const regularizedAt =
      data.employmentStatus === "regular" ? (existing?.regularized_at ?? todayInShanghai()) : null;
    await db
      .insert(people_performance_profile)
      .values({
        user_id: userId,
        manager_user_id: data.managerUserId,
        skip_manager_user_id: data.skipManagerUserId,
        hire_date: hireDate,
        employment_status: data.employmentStatus,
        probation_months: data.probationMonths,
        regularized_at: regularizedAt,
        probation_goal_template: probationGoals,
        performance_goal_template: performanceGoals,
        created_by_user_id: access.userId,
      })
      .onConflictDoUpdate({
        target: people_performance_profile.user_id,
        set: {
          manager_user_id: data.managerUserId,
          skip_manager_user_id: data.skipManagerUserId,
          hire_date: hireDate,
          employment_status: data.employmentStatus,
          probation_months: data.probationMonths,
          regularized_at: regularizedAt,
          probation_goal_template: probationGoals,
          performance_goal_template: performanceGoals,
          updated_at: new Date(),
        },
      });
    await db
      .update(performance_cycle)
      .set({ manager_user_id: data.managerUserId, updated_at: new Date() })
      .where(
        and(
          eq(performance_cycle.user_id, userId),
          inArray(performance_cycle.stage, [
            "scheduled",
            "goal_setting",
            "goal_review",
            "in_progress",
            "self_review",
            "manager_review",
            "skip_manager_review",
            "hr_calibration",
          ]),
        ),
      );
    if (data.skipManagerUserId === null) {
      await advanceCyclesAfterSkipManagerRemoval(userId);
    }
    await db
      .update(performance_cycle)
      .set({ skip_manager_user_id: null, updated_at: new Date() })
      .where(
        and(
          eq(performance_cycle.user_id, userId),
          eq(performance_cycle.kind, "probation"),
          inArray(performance_cycle.stage, [
            "scheduled",
            "goal_setting",
            "goal_review",
            "in_progress",
            "self_review",
            "manager_review",
            "skip_manager_review",
            "hr_calibration",
          ]),
        ),
      );
    await db
      .update(performance_cycle)
      .set({ skip_manager_user_id: data.skipManagerUserId, updated_at: new Date() })
      .where(
        and(
          eq(performance_cycle.user_id, userId),
          inArray(performance_cycle.kind, ["monthly", "quarterly"]),
          inArray(performance_cycle.stage, [
            "scheduled",
            "goal_setting",
            "goal_review",
            "in_progress",
            "self_review",
            "manager_review",
            "skip_manager_review",
            "hr_calibration",
          ]),
        ),
      );
    if (data.employmentStatus === "probation") {
      await ensureProbationCycles({
        userId,
        managerUserId: data.managerUserId,
        skipManagerUserId: data.skipManagerUserId,
        hireDate,
        probationMonths: data.probationMonths,
      });
      if (data.applyProbationGoals) {
        await replaceEditableCycleGoals(userId, ["probation"], data.probationGoals);
      }
    }
    configuredUserIds.push(userId);
  }

  if (data.employmentStatus === "regular" && configuredUserIds.length > 0) {
    await runPerformanceSweep();
    if (data.applyPerformanceGoals) {
      for (const userId of configuredUserIds) {
        await replaceEditableCycleGoals(userId, ["monthly"], data.performanceGoals);
      }
    }
  }
  return { ok: true, configured: configuredUserIds.length, failed };
}

export async function submitPerformanceGoals(input: unknown): Promise<{ ok: true }> {
  const data = SubmitGoalsInput.parse(input);
  const [access, cycle] = await Promise.all([
    resolvePerformanceAccess(),
    requireCycle(data.cycleId),
  ]);
  if (cycle.stage !== "goal_setting") {
    throw new AppError("PERFORMANCE_STAGE_MISMATCH", "当前不在目标制定环节", 409);
  }
  if (access.userId !== cycle.user_id && !access.manageAll && !access.manageProfiles) {
    throw new AppError("AUTH_FORBIDDEN", "只有员工本人可以提交目标", 403);
  }
  await db.transaction(async (tx) => {
    await tx.delete(performance_goal).where(eq(performance_goal.cycle_id, cycle.id));
    await tx.insert(performance_goal).values(
      data.goals.map((goal, index) => ({
        id: goal.id ?? crypto.randomUUID(),
        cycle_id: cycle.id,
        title: goal.title,
        description: goal.description,
        metric: goal.metric,
        target_value: goal.targetValue,
        weight: String(goal.weight),
        sort_order: index,
      })),
    );
    const [updated] = await tx
      .update(performance_cycle)
      .set({ stage: "goal_review", updated_at: new Date() })
      .where(and(eq(performance_cycle.id, cycle.id), eq(performance_cycle.stage, "goal_setting")))
      .returning();
    if (!updated) throw new AppError("PERFORMANCE_CONCURRENT_UPDATE", "环节已被其他人处理", 409);
    await tx.insert(performance_event).values({
      cycle_id: cycle.id,
      actor_user_id: access.userId,
      event_type: "goals_submitted",
      from_stage: "goal_setting",
      to_stage: "goal_review",
      payload: { goalCount: data.goals.length },
    });
  });
  await notifyCycleStage(cycle.id, "goal_review", "stage:goal_review");
  return { ok: true };
}

export async function reviewPerformanceGoals(input: unknown): Promise<{ ok: true }> {
  const data = ReviewGoalsInput.parse(input);
  const [access, cycle] = await Promise.all([
    resolvePerformanceAccess(),
    requireCycle(data.cycleId),
  ]);
  if (access.userId !== cycle.manager_user_id && !access.manageAll) {
    throw new AppError("AUTH_FORBIDDEN", "只有直属上级可以审核目标", 403);
  }
  const next: PerformanceStage = data.approved
    ? cycle.period_end < todayInShanghai()
      ? "self_review"
      : "in_progress"
    : "goal_setting";
  assertStage(cycle.stage, next);
  const [updated] = await db
    .update(performance_cycle)
    .set({ stage: next, updated_at: new Date() })
    .where(and(eq(performance_cycle.id, cycle.id), eq(performance_cycle.stage, "goal_review")))
    .returning();
  if (!updated) throw new AppError("PERFORMANCE_CONCURRENT_UPDATE", "环节已被其他人处理", 409);
  await db.insert(performance_event).values({
    cycle_id: cycle.id,
    actor_user_id: access.userId,
    event_type: data.approved ? "goals_approved" : "goals_rejected",
    from_stage: "goal_review",
    to_stage: next,
    payload: { comment: data.comment },
  });
  if (next === "self_review") await notifyCycleStage(cycle.id, next, `stage:${next}`);
  if (next === "goal_setting") await notifyCycleStage(cycle.id, next, `return:${Date.now()}`);
  return { ok: true };
}

export async function openPerformanceSelfReview(input: unknown): Promise<{ ok: true }> {
  const data = CycleIdInput.parse(input);
  const [access, cycle] = await Promise.all([
    resolvePerformanceAccess(),
    requireCycle(data.cycleId),
  ]);
  if (!access.manageAll) {
    throw new AppError("AUTH_FORBIDDEN", "无流程调整权限", 403);
  }
  assertStage(cycle.stage, "self_review");
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(performance_cycle)
      .set({ stage: "self_review", updated_at: new Date() })
      .where(and(eq(performance_cycle.id, cycle.id), eq(performance_cycle.stage, "in_progress")))
      .returning({ id: performance_cycle.id });
    if (!updated) {
      throw new AppError("PERFORMANCE_CONCURRENT_UPDATE", "环节已被其他人处理", 409);
    }
    await tx.insert(performance_event).values({
      cycle_id: cycle.id,
      actor_user_id: access.userId,
      event_type: "self_review_opened_manually",
      from_stage: "in_progress",
      to_stage: "self_review",
      payload: { reason: "manual" },
    });
  });
  await notifyCycleStage(cycle.id, "self_review", `manual:self_review:${Date.now()}`);
  return { ok: true };
}

export async function bulkOpenPerformanceSelfReview(input: unknown): Promise<{
  ok: true;
  opened: number;
  skipped: number;
}> {
  const data = BulkOpenSelfReviewInput.parse(input);
  const access = await resolvePerformanceAccess();
  if (!access.manageAll) {
    throw new AppError("AUTH_FORBIDDEN", "无流程调整权限", 403);
  }

  const openedIds: string[] = [];
  let skipped = 0;
  await db.transaction(async (tx) => {
    const cycles = await tx
      .select({ id: performance_cycle.id, stage: performance_cycle.stage })
      .from(performance_cycle)
      .where(inArray(performance_cycle.id, data.cycleIds));
    const cycleMap = new Map(cycles.map((cycle) => [cycle.id, cycle.stage]));
    for (const cycleId of data.cycleIds) {
      if (cycleMap.get(cycleId) !== "in_progress") {
        skipped++;
        continue;
      }
      const [updated] = await tx
        .update(performance_cycle)
        .set({ stage: "self_review", updated_at: new Date() })
        .where(and(eq(performance_cycle.id, cycleId), eq(performance_cycle.stage, "in_progress")))
        .returning({ id: performance_cycle.id });
      if (!updated) {
        skipped++;
        continue;
      }
      openedIds.push(updated.id);
      await tx.insert(performance_event).values({
        cycle_id: updated.id,
        actor_user_id: access.userId,
        event_type: "self_review_opened_manually",
        from_stage: "in_progress",
        to_stage: "self_review",
        payload: { reason: "bulk" },
      });
    }
  });
  await Promise.all(
    openedIds.map((cycleId) =>
      notifyCycleStage(cycleId, "self_review", `bulk:self_review:${Date.now()}`),
    ),
  );
  return { ok: true, opened: openedIds.length, skipped };
}

export async function submitPerformanceSelfReview(input: unknown): Promise<{ ok: true }> {
  const data = SelfReviewInput.parse(input);
  const [access, cycle] = await Promise.all([
    resolvePerformanceAccess(),
    requireCycle(data.cycleId),
  ]);
  if (access.userId !== cycle.user_id && !access.manageAll) {
    throw new AppError("AUTH_FORBIDDEN", "只有员工本人可以提交自评", 403);
  }
  await validateGoalScores(cycle.id, data.goals);
  assertStage(cycle.stage, "manager_review");
  await db.transaction(async (tx) => {
    for (const goal of data.goals) {
      const [updatedGoal] = await tx
        .update(performance_goal)
        .set({
          completion: goal.completion,
          self_score: String(goal.score),
          updated_at: new Date(),
        })
        .where(and(eq(performance_goal.id, goal.id), eq(performance_goal.cycle_id, cycle.id)))
        .returning({ id: performance_goal.id });
      if (!updatedGoal) throw new AppError("PERFORMANCE_GOAL_NOT_FOUND", "考核目标不存在", 404);
    }
    const [updated] = await tx
      .update(performance_cycle)
      .set({ self_summary: data.summary, stage: "manager_review", updated_at: new Date() })
      .where(and(eq(performance_cycle.id, cycle.id), eq(performance_cycle.stage, "self_review")))
      .returning();
    if (!updated) throw new AppError("PERFORMANCE_CONCURRENT_UPDATE", "环节已被其他人处理", 409);
    await tx.insert(performance_event).values({
      cycle_id: cycle.id,
      actor_user_id: access.userId,
      event_type: "self_review_submitted",
      from_stage: "self_review",
      to_stage: "manager_review",
    });
  });
  await notifyCycleStage(cycle.id, "manager_review", "stage:manager_review");
  return { ok: true };
}

export async function withdrawPerformanceSelfReview(input: unknown): Promise<{ ok: true }> {
  const data = CycleIdInput.parse(input);
  const [access, cycle] = await Promise.all([
    resolvePerformanceAccess(),
    requireCycle(data.cycleId),
  ]);
  if (access.userId !== cycle.user_id && !access.manageAll) {
    throw new AppError("AUTH_FORBIDDEN", "只有员工本人可以撤回自评", 403);
  }
  assertStage(cycle.stage, "self_review");
  const goals = await db
    .select({
      managerScore: performance_goal.manager_score,
      skipManagerScore: performance_goal.skip_manager_score,
    })
    .from(performance_goal)
    .where(eq(performance_goal.cycle_id, cycle.id));
  if (goals.some((goal) => goal.managerScore !== null || goal.skipManagerScore !== null)) {
    throw new AppError("PERFORMANCE_SELF_REVIEW_LOCKED", "上级已开始评分，不能撤回自评", 409);
  }
  const [updated] = await db
    .update(performance_cycle)
    .set({ stage: "self_review", updated_at: new Date() })
    .where(and(eq(performance_cycle.id, cycle.id), eq(performance_cycle.stage, "manager_review")))
    .returning({ id: performance_cycle.id });
  if (!updated) throw new AppError("PERFORMANCE_CONCURRENT_UPDATE", "环节已被其他人处理", 409);
  await db.insert(performance_event).values({
    cycle_id: cycle.id,
    actor_user_id: access.userId,
    event_type: "self_review_withdrawn",
    from_stage: "manager_review",
    to_stage: "self_review",
  });
  await notifyCycleStage(cycle.id, "self_review", `withdraw:self_review:${Date.now()}`);
  return { ok: true };
}

export async function submitPerformanceManagerReview(input: unknown): Promise<{ ok: true }> {
  const data = ManagerReviewInput.parse(input);
  const [access, cycle] = await Promise.all([
    resolvePerformanceAccess(),
    requireCycle(data.cycleId),
  ]);
  if (access.userId !== cycle.manager_user_id && !access.manageAll) {
    throw new AppError("AUTH_FORBIDDEN", "只有直属上级可以提交评估", 403);
  }
  await validateGoalScores(cycle.id, data.goals);
  const next: PerformanceStage =
    cycle.kind === "probation"
      ? "hr_calibration"
      : cycle.skip_manager_user_id
        ? "skip_manager_review"
        : "hr_calibration";
  assertStage(cycle.stage, next);
  const directTotal = calculateWeightedScore(
    data.goals.map((goal) => ({ weight: 0, managerScore: goal.score })),
  );
  if (directTotal === null) {
    throw new AppError("PERFORMANCE_SCORE_INCOMPLETE", "请先完成直接上级评分", 400);
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    for (const goal of data.goals) {
      const [updatedGoal] = await tx
        .update(performance_goal)
        .set({
          manager_score: String(goal.score),
          manager_comment: goal.comment,
          updated_at: now,
        })
        .where(and(eq(performance_goal.id, goal.id), eq(performance_goal.cycle_id, cycle.id)))
        .returning({ id: performance_goal.id });
      if (!updatedGoal) throw new AppError("PERFORMANCE_GOAL_NOT_FOUND", "考核目标不存在", 404);
    }
    const [updated] = await tx
      .update(performance_cycle)
      .set({
        manager_summary: data.summary,
        stage: next,
        final_score: null,
        // 试用期评级不能由分数推导；正式绩效沿用现有规则。
        final_grade: null,
        completed_at: null,
        updated_at: now,
      })
      .where(and(eq(performance_cycle.id, cycle.id), eq(performance_cycle.stage, "manager_review")))
      .returning();
    if (!updated) throw new AppError("PERFORMANCE_CONCURRENT_UPDATE", "环节已被其他人处理", 409);
    await tx.insert(performance_event).values({
      cycle_id: cycle.id,
      actor_user_id: access.userId,
      event_type: "manager_review_submitted",
      from_stage: "manager_review",
      to_stage: next,
      payload: { directTotal },
    });
  });
  await notifyCycleStage(cycle.id, next, `stage:${next}`);
  return { ok: true };
}

export async function submitPerformanceSkipManagerReview(input: unknown): Promise<{ ok: true }> {
  const data = ManagerReviewInput.parse(input);
  const [access, cycle] = await Promise.all([
    resolvePerformanceAccess(),
    requireCycle(data.cycleId),
  ]);
  if (access.userId !== cycle.skip_manager_user_id && !access.manageAll) {
    throw new AppError("AUTH_FORBIDDEN", "只有隔级上级可以提交评估", 403);
  }
  await validateGoalScores(cycle.id, data.goals);
  const next: PerformanceStage = cycle.requires_final_review ? "hr_calibration" : "completed";
  assertStage(cycle.stage, next);
  const directGoals = await db
    .select({ id: performance_goal.id, score: performance_goal.manager_score })
    .from(performance_goal)
    .where(eq(performance_goal.cycle_id, cycle.id));
  const directTotal = calculateWeightedScore(
    directGoals.map((goal) => ({
      weight: 0,
      managerScore: goal.score === null ? null : Number(goal.score),
    })),
  );
  const skipTotal = calculateWeightedScore(
    data.goals.map((goal) => ({ weight: 0, managerScore: goal.score })),
  );
  const finalScore = calculateReviewScore(cycle.kind, directTotal, skipTotal);
  if (finalScore === null) {
    throw new AppError("PERFORMANCE_SCORE_INCOMPLETE", "请先完成直接上级和隔级上级评分", 400);
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    for (const goal of data.goals) {
      const [updatedGoal] = await tx
        .update(performance_goal)
        .set({
          skip_manager_score: String(goal.score),
          skip_manager_comment: goal.comment,
          updated_at: now,
        })
        .where(and(eq(performance_goal.id, goal.id), eq(performance_goal.cycle_id, cycle.id)))
        .returning({ id: performance_goal.id });
      if (!updatedGoal) throw new AppError("PERFORMANCE_GOAL_NOT_FOUND", "考核目标不存在", 404);
    }
    const [updated] = await tx
      .update(performance_cycle)
      .set({
        skip_manager_summary: data.summary,
        stage: next,
        final_score: next === "completed" ? String(finalScore) : null,
        // 隔级评估只适用于正式绩效，沿用现有等级规则。
        final_grade: next === "completed" ? gradeForScore(finalScore) : null,
        completed_at: next === "completed" ? now : null,
        updated_at: now,
      })
      .where(
        and(eq(performance_cycle.id, cycle.id), eq(performance_cycle.stage, "skip_manager_review")),
      )
      .returning();
    if (!updated) throw new AppError("PERFORMANCE_CONCURRENT_UPDATE", "环节已被其他人处理", 409);
    await tx.insert(performance_event).values({
      cycle_id: cycle.id,
      actor_user_id: access.userId,
      event_type: "skip_manager_review_submitted",
      from_stage: "skip_manager_review",
      to_stage: next,
      payload: { directTotal, skipTotal, finalScore },
    });
  });
  if (next === "hr_calibration") {
    await notifyCycleStage(cycle.id, next, "stage:hr_calibration");
  }
  return { ok: true };
}

export async function calibratePerformance(input: unknown): Promise<{ ok: true }> {
  const data = CalibrateInput.parse(input);
  const [access, cycle] = await Promise.all([
    resolvePerformanceAccess(),
    requireCycle(data.cycleId),
  ]);
  if (!access.calibrate) throw new AppError("AUTH_FORBIDDEN", "无HR校准权限", 403);
  if (cycle.kind === "probation" && !data.rating) {
    throw new AppError("PERFORMANCE_RATING_REQUIRED", "请选择试用期评级", 400);
  }
  if (cycle.kind === "probation" && cycle.requires_final_review && !data.probationResult) {
    throw new AppError("PERFORMANCE_RESULT_REQUIRED", "试用期考核必须选择转正结论", 400);
  }
  const goals = await db
    .select({
      weight: performance_goal.weight,
      managerScore: performance_goal.manager_score,
      skipManagerScore: performance_goal.skip_manager_score,
    })
    .from(performance_goal)
    .where(eq(performance_goal.cycle_id, cycle.id));
  const directTotal = calculateWeightedScore(
    goals.map((goal) => ({
      weight: Number(goal.weight),
      managerScore: goal.managerScore === null ? null : Number(goal.managerScore),
    })),
  );
  const skipTotal = calculateWeightedScore(
    goals.map((goal) => ({
      weight: Number(goal.weight),
      managerScore: goal.skipManagerScore === null ? null : Number(goal.skipManagerScore),
    })),
  );
  const finalScore = calculateReviewScore(cycle.kind, directTotal, skipTotal);
  if (finalScore === null) {
    throw new AppError("PERFORMANCE_SCORE_INCOMPLETE", "请先完成上级评分", 400);
  }
  const finalGrade = cycle.kind === "probation" ? (data.rating ?? null) : gradeForScore(finalScore);
  const next: PerformanceStage = cycle.kind === "probation" && !cycle.requires_final_review
    ? "completed"
    : "employee_confirm";
  const probationResult = cycle.kind === "probation" && cycle.requires_final_review
    ? (data.probationResult ?? null)
    : null;
  const now = new Date();
  assertStage(cycle.stage, next);
  const [updated] = await db
    .update(performance_cycle)
    .set({
      hr_user_id: access.userId,
      hr_comment: data.comment,
      final_score: String(finalScore),
      final_grade: finalGrade,
      probation_result: probationResult,
      stage: next,
      completed_at: next === "completed" ? now : null,
      updated_at: now,
    })
    .where(and(eq(performance_cycle.id, cycle.id), eq(performance_cycle.stage, "hr_calibration")))
    .returning();
  if (!updated) throw new AppError("PERFORMANCE_CONCURRENT_UPDATE", "环节已被其他人处理", 409);
  await db.insert(performance_event).values({
    cycle_id: cycle.id,
    actor_user_id: access.userId,
    event_type: "result_calibrated",
    from_stage: "hr_calibration",
    to_stage: next,
    payload: {
      finalScore,
      finalRating: finalGrade,
      probationResult,
    },
  });
  if (next === "employee_confirm") {
    await notifyCycleStage(cycle.id, next, "stage:employee_confirm");
  }
  return { ok: true };
}

export async function returnPerformanceForReview(input: unknown): Promise<{ ok: true }> {
  const data = ReturnPerformanceInput.parse(input);
  const [access, cycle] = await Promise.all([
    resolvePerformanceAccess(),
    requireCycle(data.cycleId),
  ]);
  const target = data.targetStage;
  const isManager = access.userId === cycle.manager_user_id;
  const isSkipManager = access.userId === cycle.skip_manager_user_id;
  const allowed =
    access.manageAll ||
    (cycle.stage === "hr_calibration" && access.calibrate) ||
    (cycle.stage === "employee_confirm" && access.calibrate && target === "hr_calibration") ||
    (cycle.stage === "skip_manager_review" &&
      isSkipManager &&
      (target === "self_review" || target === "manager_review")) ||
    (cycle.stage === "manager_review" && isManager && target === "self_review");
  if (!allowed) throw new AppError("AUTH_FORBIDDEN", "无权退回到该评估环节", 403);
  if (
    target === "skip_manager_review" &&
    (!cycle.skip_manager_user_id || cycle.kind === "probation")
  ) {
    throw new AppError("PERFORMANCE_STAGE_INVALID", "该考核未配置隔级评估", 400);
  }
  assertStage(cycle.stage, target);
  const clearManager =
    target === "self_review" || (cycle.stage === "hr_calibration" && target === "manager_review");
  const clearSkip = target !== "hr_calibration";
  const [updated] = await db
    .update(performance_cycle)
    .set({
      stage: target,
      ...(cycle.stage === "hr_calibration" || target === "hr_calibration"
        ? {
            hr_comment: null,
            final_score: null,
            final_grade: null,
            probation_result: null,
            completed_at: null,
          }
        : {}),
      ...(clearManager ? { manager_summary: null } : {}),
      ...(clearSkip ? { skip_manager_summary: null } : {}),
      updated_at: new Date(),
    })
    .where(and(eq(performance_cycle.id, cycle.id), eq(performance_cycle.stage, cycle.stage)))
    .returning({ id: performance_cycle.id });
  if (!updated) throw new AppError("PERFORMANCE_CONCURRENT_UPDATE", "环节已被其他人处理", 409);
  if (clearManager || clearSkip) {
    await db
      .update(performance_goal)
      .set({
        ...(clearManager ? { manager_score: null, manager_comment: null } : {}),
        ...(clearSkip ? { skip_manager_score: null, skip_manager_comment: null } : {}),
        updated_at: new Date(),
      })
      .where(eq(performance_goal.cycle_id, cycle.id));
  }
  await db.insert(performance_event).values({
    cycle_id: cycle.id,
    actor_user_id: access.userId,
    event_type: "calibration_returned_for_review",
    from_stage: cycle.stage,
    to_stage: target,
  });
  await notifyCycleStage(cycle.id, target, `return:review:${Date.now()}`);
  return { ok: true };
}

export async function confirmPerformanceResult(input: unknown): Promise<{ ok: true }> {
  const data = CycleIdInput.parse(input);
  const [access, cycle] = await Promise.all([
    resolvePerformanceAccess(),
    requireCycle(data.cycleId),
  ]);
  if (access.userId !== cycle.user_id && !access.manageAll) {
    throw new AppError("AUTH_FORBIDDEN", "只有员工本人可以确认结果", 403);
  }
  assertStage(cycle.stage, "completed");
  const now = new Date();
  const [updated] = await db
    .update(performance_cycle)
    .set({ stage: "completed", confirmed_at: now, completed_at: now, updated_at: now })
    .where(and(eq(performance_cycle.id, cycle.id), eq(performance_cycle.stage, "employee_confirm")))
    .returning();
  if (!updated) throw new AppError("PERFORMANCE_CONCURRENT_UPDATE", "环节已被其他人处理", 409);
  await db.insert(performance_event).values({
    cycle_id: cycle.id,
    actor_user_id: access.userId,
    event_type: "result_confirmed",
    from_stage: "employee_confirm",
    to_stage: "completed",
  });

  const { regularized } = await applyConfirmedCycleEffects(updated);
  if (regularized) await runPerformanceSweep();
  return { ok: true };
}
