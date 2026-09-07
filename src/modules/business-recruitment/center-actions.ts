"use server";

import { randomUUID } from "node:crypto";

import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db/client";
import {
  recruitment_application,
  recruitment_candidate,
  recruitment_demand,
  recruitment_stage_event,
} from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { AppError } from "@/lib/errors";

import { resolveRecruitmentAccess } from "./authz";
import {
  EmptyRecruitmentCenterInput,
  SavePipelineApplicationInput,
  SaveRecruitmentDemandInput,
} from "./center-schema";
import { findVisiblePipelineApplication, listRecruitmentCenter } from "./center-server";
import type { RecruitmentCenterData } from "./center-types";
import { derivePipelineStage } from "./center-workflow";
import {
  syncRecruitmentPipelineFromDingtalk,
  type RecruitmentPipelineSyncResult,
} from "./dingtalk-pipeline-sync";

function identityKey(phone: string | null | undefined): string | null {
  const normalized = phone?.replace(/\D/g, "") ?? "";
  return normalized.length >= 6 ? `phone:${normalized}` : null;
}

export async function getRecruitmentCenterAction(input: unknown): Promise<RecruitmentCenterData> {
  EmptyRecruitmentCenterInput.parse(input);
  return listRecruitmentCenter();
}

export async function syncRecruitmentPipelineFromDingtalkAction(
  input: unknown,
): Promise<RecruitmentPipelineSyncResult> {
  EmptyRecruitmentCenterInput.parse(input);
  return syncRecruitmentPipelineFromDingtalk();
}

export async function savePipelineApplication(input: unknown): Promise<{ id: string }> {
  const data = SavePipelineApplicationInput.parse(input);
  const access = await resolveRecruitmentAccess();
  if (!access.canEditCandidate) {
    throw new AppError("AUTH_FORBIDDEN", "无候选人流程维护权限", 403);
  }
  const stage = derivePipelineStage(data);
  if (data.id) {
    const applicationId = data.id;
    const before = await findVisiblePipelineApplication(applicationId);
    await db.transaction(async (tx) => {
      await tx
        .update(recruitment_candidate)
        .set({
          name: data.candidateName,
          phone: data.phone ?? null,
          identity_key: identityKey(data.phone),
          updated_at: new Date(),
        })
        .where(eq(recruitment_candidate.id, before.candidate.id));
      await tx
        .update(recruitment_application)
        .set({
          project: data.project ?? null,
          channel: data.channel,
          source_account: data.sourceAccount ?? null,
          recruiter_user_id: data.recruiterUserId ?? null,
          recruiter_name_snapshot: data.recruiterNameSnapshot ?? null,
          stage,
          invited_date: data.invitedDate,
          interview_date: data.interviewDate ?? null,
          interview_time: data.interviewTime ?? null,
          attendance_status: data.attendanceStatus,
          initial_result: data.initialResult,
          final_result: data.finalResult,
          offer_status: data.offerStatus,
          expected_join_date: data.expectedJoinDate ?? null,
          actual_join_date: data.actualJoinDate ?? null,
          trial_result: data.trialResult,
          trial_date: data.trialDate ?? null,
          mentor_user_id: data.mentorUserId ?? null,
          mentor_name_snapshot: data.mentorNameSnapshot ?? null,
          contract_status: data.contractStatus,
          leave_date: data.leaveDate ?? null,
          leave_reason: data.leaveReason ?? null,
          notes: data.notes ?? null,
          updated_at: new Date(),
        })
        .where(eq(recruitment_application.id, applicationId));
      await tx.insert(recruitment_stage_event).values({
        application_id: applicationId,
        actor_user_id: access.actorUserId,
        event_type: "application_updated",
        from_stage: before.application.stage,
        to_stage: stage,
        payload: { candidateName: data.candidateName },
      });
    });
    await writeAuditLog({
      user_id: access.actorUserId,
      action: "recruitment.pipeline.update",
      target_type: "recruitment_application",
      target_id: applicationId,
      before: { stage: before.application.stage },
      after: { stage },
    });
    return { id: applicationId };
  }

  const candidateKey = identityKey(data.phone);
  let candidateId: string | undefined;
  if (candidateKey) {
    const [existing] = await db
      .select({ id: recruitment_candidate.id })
      .from(recruitment_candidate)
      .where(eq(recruitment_candidate.identity_key, candidateKey));
    candidateId = existing?.id;
  }
  candidateId = candidateId ?? randomUUID();
  const resolvedCandidateId = candidateId;
  const applicationId = randomUUID();
  await db.transaction(async (tx) => {
    if (
      !candidateKey ||
      !(
        await tx
          .select({ id: recruitment_candidate.id })
          .from(recruitment_candidate)
          .where(eq(recruitment_candidate.id, resolvedCandidateId))
      ).length
    ) {
      await tx.insert(recruitment_candidate).values({
        id: resolvedCandidateId,
        name: data.candidateName,
        phone: data.phone ?? null,
        identity_key: candidateKey,
      });
    }
    await tx.insert(recruitment_application).values({
      id: applicationId,
      candidate_id: resolvedCandidateId,
      project: data.project ?? null,
      channel: data.channel,
      source_account: data.sourceAccount ?? null,
      recruiter_user_id: data.recruiterUserId ?? access.actorUserId,
      recruiter_name_snapshot: data.recruiterNameSnapshot ?? null,
      stage,
      invited_date: data.invitedDate,
      interview_date: data.interviewDate ?? null,
      interview_time: data.interviewTime ?? null,
      attendance_status: data.attendanceStatus,
      initial_result: data.initialResult,
      final_result: data.finalResult,
      offer_status: data.offerStatus,
      expected_join_date: data.expectedJoinDate ?? null,
      actual_join_date: data.actualJoinDate ?? null,
      trial_result: data.trialResult,
      trial_date: data.trialDate ?? null,
      mentor_user_id: data.mentorUserId ?? null,
      mentor_name_snapshot: data.mentorNameSnapshot ?? null,
      contract_status: data.contractStatus,
      leave_date: data.leaveDate ?? null,
      leave_reason: data.leaveReason ?? null,
      notes: data.notes ?? null,
      created_by_user_id: access.actorUserId,
    });
    await tx.insert(recruitment_stage_event).values({
      application_id: applicationId,
      actor_user_id: access.actorUserId,
      event_type: "application_created",
      to_stage: stage,
      payload: { candidateName: data.candidateName },
    });
  });
  await writeAuditLog({
    user_id: access.actorUserId,
    action: "recruitment.pipeline.create",
    target_type: "recruitment_application",
    target_id: applicationId,
    after: { stage, candidateName: data.candidateName },
  });
  return { id: applicationId };
}

export async function saveRecruitmentDemand(input: unknown): Promise<{ id: string }> {
  const data = SaveRecruitmentDemandInput.parse(input);
  const access = await resolveRecruitmentAccess();
  if (!access.canManageDemand) {
    throw new AppError("AUTH_FORBIDDEN", "无招聘需求维护权限", 403);
  }
  const month = `${data.month}-01`;
  const duplicateConditions = [
    eq(recruitment_demand.month, month),
    eq(recruitment_demand.project, data.project),
  ];
  if (data.id) duplicateConditions.push(ne(recruitment_demand.id, data.id));
  const [duplicate] = await db
    .select({ id: recruitment_demand.id })
    .from(recruitment_demand)
    .where(and(...duplicateConditions));
  if (duplicate) throw new AppError("RECRUITMENT_DEMAND_DUPLICATE", "该月份和项目已有需求", 409);

  const id = data.id ?? randomUUID();
  if (data.id) {
    await db
      .update(recruitment_demand)
      .set({
        month,
        category: data.category ?? null,
        project: data.project,
        target_count: data.targetCount,
        notes: data.notes ?? null,
        updated_by_user_id: access.actorUserId,
        updated_at: new Date(),
      })
      .where(eq(recruitment_demand.id, data.id));
  } else {
    await db.insert(recruitment_demand).values({
      id,
      month,
      category: data.category ?? null,
      project: data.project,
      target_count: data.targetCount,
      notes: data.notes ?? null,
      created_by_user_id: access.actorUserId,
      updated_by_user_id: access.actorUserId,
    });
  }
  await writeAuditLog({
    user_id: access.actorUserId,
    action: data.id ? "recruitment.demand.update" : "recruitment.demand.create",
    target_type: "recruitment_demand",
    target_id: id,
    after: { month, project: data.project, targetCount: data.targetCount },
  });
  return { id };
}
