import "server-only";

import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";

import { db } from "@/db/client";
import {
  recruitment_application,
  recruitment_candidate,
  recruitment_stage_event,
} from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { AppError } from "@/lib/errors";

import { resolveRecruitmentAccess } from "./authz";
import { findActiveStaffByNames } from "./center-server";
import type { RecruitmentPipelineImportResult } from "./center-types";
import { parsePipelineWorkbook } from "./pipeline-import";

export async function importPipelineWorkbook(
  buffer: Buffer | ArrayBuffer,
): Promise<RecruitmentPipelineImportResult> {
  const access = await resolveRecruitmentAccess();
  if (!access.canEditCandidate) {
    throw new AppError("AUTH_FORBIDDEN", "无招聘流程导入权限", 403);
  }
  const parsed = parsePipelineWorkbook(buffer);
  if (parsed.rows.length === 0) {
    return { imported: 0, skipped: parsed.issues.length, issues: parsed.issues };
  }
  const existing = await db
    .select({ sourceKey: recruitment_application.source_key })
    .from(recruitment_application)
    .where(
      inArray(
        recruitment_application.source_key,
        parsed.rows.map((row) => row.sourceKey),
      ),
    );
  const existingKeys = new Set(existing.map((row) => row.sourceKey).filter(Boolean));
  const pending = parsed.rows.filter((row) => !existingKeys.has(row.sourceKey));
  const staffByName = await findActiveStaffByNames(
    pending.flatMap((row) => [row.recruiterName ?? "", row.mentorName ?? ""]),
  );
  if (pending.length > 0) {
    await db.transaction(async (tx) => {
      for (const row of pending) {
        const candidateId = randomUUID();
        const applicationId = randomUUID();
        await tx.insert(recruitment_candidate).values({
          id: candidateId,
          name: row.candidateName,
        });
        await tx.insert(recruitment_application).values({
          id: applicationId,
          candidate_id: candidateId,
          project: row.project,
          channel: row.channel,
          recruiter_user_id: row.recruiterName
            ? (staffByName.get(row.recruiterName) ?? null)
            : null,
          recruiter_name_snapshot: row.recruiterName,
          stage: row.stage,
          invited_date: row.invitedDate,
          interview_date: row.interviewDate,
          interview_time: row.interviewTime,
          attendance_status: row.attendanceStatus,
          initial_result: row.initialResult,
          final_result: row.finalResult,
          offer_status: row.offerStatus,
          expected_join_date: row.expectedJoinDate,
          actual_join_date: row.actualJoinDate,
          trial_result: row.trialResult,
          trial_date: row.actualJoinDate,
          mentor_user_id: row.mentorName ? (staffByName.get(row.mentorName) ?? null) : null,
          mentor_name_snapshot: row.mentorName,
          contract_status: row.contractStatus,
          leave_date: row.leaveDate,
          notes: row.notes,
          source_key: row.sourceKey,
          created_by_user_id: access.actorUserId,
        });
        await tx.insert(recruitment_stage_event).values({
          application_id: applicationId,
          actor_user_id: access.actorUserId,
          event_type: "application_imported",
          to_stage: row.stage,
          payload: { sourceRow: row.sourceRow, sourceKey: row.sourceKey },
        });
      }
    });
  }
  await writeAuditLog({
    user_id: access.actorUserId,
    action: "recruitment.pipeline.import",
    target_type: "recruitment_application",
    target_id: null,
    after: { imported: pending.length, skipped: parsed.rows.length - pending.length },
  });
  return {
    imported: pending.length,
    skipped: parsed.rows.length - pending.length + parsed.issues.length,
    issues: parsed.issues,
  };
}
