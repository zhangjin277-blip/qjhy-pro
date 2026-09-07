import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db/client";
import {
  dingtalk_user,
  recruitment_application,
  recruitment_candidate,
  recruitment_demand,
} from "@/db/schema";
import { AppError } from "@/lib/errors";

import { recruitmentCenterScopeCondition, resolveRecruitmentAccess } from "./authz";
import type { RecruitmentApplicationRow, RecruitmentCenterData } from "./center-types";
import {
  attachDemandProgress,
  buildMonthlyTrend,
  buildRecruiterMetrics,
  buildRecruitmentFunnel,
} from "./center-workflow";

const recruiter = alias(dingtalk_user, "pipeline_recruiter");
const mentor = alias(dingtalk_user, "pipeline_mentor");

function toApplicationRow(row: {
  application: typeof recruitment_application.$inferSelect;
  candidate: typeof recruitment_candidate.$inferSelect;
  recruiterName: string | null;
  mentorName: string | null;
}): RecruitmentApplicationRow {
  const application = row.application;
  return {
    id: application.id,
    candidateId: row.candidate.id,
    candidateName: row.candidate.name,
    phone: row.candidate.phone,
    project: application.project,
    channel: application.channel,
    sourceAccount: application.source_account,
    recruiterUserId: application.recruiter_user_id,
    recruiterName: row.recruiterName ?? application.recruiter_name_snapshot ?? "未分配招聘人员",
    stage: application.stage,
    invitedDate: application.invited_date,
    interviewDate: application.interview_date,
    interviewTime: application.interview_time,
    attendanceStatus: application.attendance_status,
    initialResult: application.initial_result,
    finalResult: application.final_result,
    offerStatus: application.offer_status,
    expectedJoinDate: application.expected_join_date,
    actualJoinDate: application.actual_join_date,
    trialResult: application.trial_result,
    trialDate: application.trial_date,
    mentorUserId: application.mentor_user_id,
    mentorName: row.mentorName ?? application.mentor_name_snapshot,
    contractStatus: application.contract_status,
    leaveDate: application.leave_date,
    leaveReason: application.leave_reason,
    notes: application.notes,
    updatedAt: application.updated_at.toISOString(),
  };
}

export async function listRecruitmentCenter(): Promise<RecruitmentCenterData> {
  const access = await resolveRecruitmentAccess();
  const scopeCondition = await recruitmentCenterScopeCondition(access);
  const [applicationRows, demandRows, staff] = await Promise.all([
    db
      .select({
        application: recruitment_application,
        candidate: recruitment_candidate,
        recruiterName: recruiter.name,
        mentorName: mentor.name,
      })
      .from(recruitment_application)
      .innerJoin(
        recruitment_candidate,
        eq(recruitment_candidate.id, recruitment_application.candidate_id),
      )
      .leftJoin(recruiter, eq(recruiter.user_id, recruitment_application.recruiter_user_id))
      .leftJoin(mentor, eq(mentor.user_id, recruitment_application.mentor_user_id))
      .where(scopeCondition)
      .orderBy(
        desc(recruitment_application.invited_date),
        desc(recruitment_application.updated_at),
      ),
    db
      .select()
      .from(recruitment_demand)
      .orderBy(desc(recruitment_demand.month), asc(recruitment_demand.project)),
    db
      .select({ userId: dingtalk_user.user_id, name: dingtalk_user.name })
      .from(dingtalk_user)
      .where(eq(dingtalk_user.active, true))
      .orderBy(asc(dingtalk_user.name)),
  ]);
  const applications = applicationRows.map(toApplicationRow);
  const demands = attachDemandProgress(
    demandRows.map((row) => ({
      id: row.id,
      month: row.month,
      category: row.category,
      project: row.project,
      targetCount: row.target_count,
      notes: row.notes,
    })),
    applications,
  );
  return {
    applications,
    demands,
    funnel: buildRecruitmentFunnel(applications),
    recruiterMetrics: buildRecruiterMetrics(applications),
    monthlyTrend: buildMonthlyTrend(applications),
    staff,
    capabilities: {
      canEditPipeline: access.canEditCandidate,
      canManageDemand: access.canManageDemand,
      canImport: access.canEditCandidate,
    },
  };
}

export async function findVisiblePipelineApplication(id: string) {
  const access = await resolveRecruitmentAccess();
  const scopeCondition = await recruitmentCenterScopeCondition(access);
  const [row] = await db
    .select({ application: recruitment_application, candidate: recruitment_candidate })
    .from(recruitment_application)
    .innerJoin(
      recruitment_candidate,
      eq(recruitment_candidate.id, recruitment_application.candidate_id),
    )
    .where(
      scopeCondition
        ? and(eq(recruitment_application.id, id), scopeCondition)
        : eq(recruitment_application.id, id),
    );
  if (!row) {
    throw new AppError("RECRUITMENT_APPLICATION_NOT_FOUND", "应聘记录不存在或无权查看", 404);
  }
  return row;
}

export async function findActiveStaffByNames(names: string[]): Promise<Map<string, string>> {
  const uniqueNames = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  if (uniqueNames.length === 0) return new Map();
  const users = await db
    .select({ userId: dingtalk_user.user_id, name: dingtalk_user.name })
    .from(dingtalk_user)
    .where(inArray(dingtalk_user.name, uniqueNames));
  const counts = new Map<string, number>();
  for (const user of users) counts.set(user.name, (counts.get(user.name) ?? 0) + 1);
  return new Map(
    users.filter((user) => counts.get(user.name) === 1).map((user) => [user.name, user.userId]),
  );
}
