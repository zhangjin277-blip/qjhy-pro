"use server";

import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { business_recruitment_candidate, business_recruitment_event } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { AppError } from "@/lib/errors";

import { findVisibleRecruitmentCandidate, resolveRecruitmentAccess } from "./authz";
import {
  EmptyRecruitmentInput,
  RecruitmentIdInput,
  SaveRecruitmentBaseInput,
  SaveRecruitmentBusinessReviewInput,
  SaveRecruitmentOnboardingInput,
  SaveRecruitmentOperationReviewInput,
} from "./schema";
import { getRecruitmentCandidateDetail, listRecruitmentBoard } from "./server";
import type { RecruitmentBoardData, RecruitmentCandidateDetail } from "./types";
import { countBusinessReview, onboardingStatus, recommendRecruitmentGrade } from "./workflow";

/**
 * Expected business/validation failures are returned to the client instead of
 * being thrown across the Server Components boundary.  A thrown error in a
 * production Server Action is intentionally redacted by Next.js, which used
 * to leave the recruitment drawer with only a generic error message.
 */
export type RecruitmentSaveResult = { ok: true; id: string } | { ok: false; error: string };

export type RecruitmentDeleteResult = { ok: true } | { ok: false; error: string };

function requirePoint(allowed: boolean, message: string): void {
  if (!allowed) throw new AppError("AUTH_FORBIDDEN", message, 403);
}

export async function getRecruitmentBoardAction(input: unknown): Promise<RecruitmentBoardData> {
  EmptyRecruitmentInput.parse(input);
  return listRecruitmentBoard();
}

export async function getRecruitmentCandidateDetailAction(
  input: unknown,
): Promise<RecruitmentCandidateDetail> {
  const data = RecruitmentIdInput.parse(input);
  return getRecruitmentCandidateDetail(data.id);
}

export async function saveRecruitmentBase(input: unknown): Promise<RecruitmentSaveResult> {
  const parsed = SaveRecruitmentBaseInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "请检查表单内容" };
  }

  try {
    const data = parsed.data;
    const access = await resolveRecruitmentAccess();
    requirePoint(access.canEditCandidate, "无候选人登记权限");

    const duplicateConditions = [
      eq(business_recruitment_candidate.platform, data.platform),
      eq(business_recruitment_candidate.account_id, data.accountId),
    ];
    if (data.id) duplicateConditions.push(ne(business_recruitment_candidate.id, data.id));
    const [duplicate] = await db
      .select({ id: business_recruitment_candidate.id })
      .from(business_recruitment_candidate)
      .where(and(...duplicateConditions));
    if (duplicate) {
      throw new AppError("RECRUITMENT_ACCOUNT_DUPLICATE", "该平台账号已登记", 409);
    }

    const now = new Date();
    if (data.id) {
      const candidateId = data.id;
      const before = await findVisibleRecruitmentCandidate(candidateId, access);
      const nextStatus =
        before.status === "draft" && data.advance ? "business_review" : before.status;
      await db.transaction(async (tx) => {
        await tx
          .update(business_recruitment_candidate)
          .set({
            platform: data.platform,
            game_product: data.gameProduct,
            anchor_name: data.anchorName,
            gender: data.gender,
            phone: data.phone,
            account_nickname: data.accountNickname,
            account_id: data.accountId,
            uid: data.uid || null,
            follower_count: data.followerCount,
            account_summary: data.accountSummary || null,
            status: nextStatus,
            updated_at: now,
          })
          .where(eq(business_recruitment_candidate.id, candidateId));
        await tx.insert(business_recruitment_event).values({
          candidate_id: candidateId,
          actor_user_id: access.actorUserId,
          event_type: "base_saved",
          from_status: before.status,
          to_status: nextStatus,
          payload: { advance: data.advance },
        });
      });
      await writeAuditLog({
        user_id: access.actorUserId,
        action: "business_recruitment.base.update",
        target_type: "business_recruitment_candidate",
        target_id: candidateId,
        before: { status: before.status },
        after: { status: nextStatus, platform: data.platform, accountId: data.accountId },
      });
      return { ok: true, id: candidateId };
    }

    const id = crypto.randomUUID();
    const status = data.advance ? "business_review" : "draft";
    await db.transaction(async (tx) => {
      await tx.insert(business_recruitment_candidate).values({
        id,
        platform: data.platform,
        game_product: data.gameProduct,
        anchor_name: data.anchorName,
        gender: data.gender,
        phone: data.phone,
        account_nickname: data.accountNickname,
        account_id: data.accountId,
        uid: data.uid || null,
        follower_count: data.followerCount,
        account_summary: data.accountSummary || null,
        recruiter_user_id: access.actorUserId,
        created_by_user_id: access.actorUserId,
        status,
      });
      await tx.insert(business_recruitment_event).values({
        candidate_id: id,
        actor_user_id: access.actorUserId,
        event_type: "candidate_created",
        from_status: null,
        to_status: status,
        payload: { advance: data.advance },
      });
    });
    await writeAuditLog({
      user_id: access.actorUserId,
      action: "business_recruitment.create",
      target_type: "business_recruitment_candidate",
      target_id: id,
      after: { status, platform: data.platform, accountId: data.accountId },
    });
    return { ok: true, id };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "请检查表单内容" };
    }
    console.error("[business-recruitment] save base failed", error);
    return { ok: false, error: "保存失败，请稍后重试" };
  }
}

export async function deleteRecruitmentCandidate(input: unknown): Promise<RecruitmentDeleteResult> {
  const parsed = RecruitmentIdInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "候选人编号无效" };
  try {
    const access = await resolveRecruitmentAccess();
    requirePoint(access.canEditCandidate, "无候选人登记权限");
    const before = await findVisibleRecruitmentCandidate(parsed.data.id, access);
    await db
      .delete(business_recruitment_candidate)
      .where(eq(business_recruitment_candidate.id, parsed.data.id));
    await writeAuditLog({
      user_id: access.actorUserId,
      action: "business_recruitment.delete",
      target_type: "business_recruitment_candidate",
      target_id: parsed.data.id,
      before: {
        anchorName: before.anchor_name,
        platform: before.platform,
        accountId: before.account_id,
      },
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.message };
    console.error("[business-recruitment] delete candidate failed", error);
    return { ok: false, error: "删除失败，请稍后重试" };
  }
}

export async function saveRecruitmentBusinessReview(input: unknown): Promise<{ ok: true }> {
  const data = SaveRecruitmentBusinessReviewInput.parse(input);
  const access = await resolveRecruitmentAccess();
  requirePoint(access.canEditCandidate, "无商务初评权限");
  const before = await findVisibleRecruitmentCandidate(data.id, access);
  const count = countBusinessReview(data);
  const grade = recommendRecruitmentGrade(count);
  const nextStatus =
    data.advance && (before.status === "draft" || before.status === "business_review")
      ? "operation_review"
      : before.status === "draft"
        ? "business_review"
        : before.status;
  await db.transaction(async (tx) => {
    await tx
      .update(business_recruitment_candidate)
      .set({
        equipment_status: data.equipmentStatus,
        willingness: data.willingness,
        policy: data.policy || null,
        appearance_pass: data.appearancePass,
        appearance_note: data.appearanceNote || null,
        voice_pass: data.voicePass,
        voice_note: data.voiceNote || null,
        expression_pass: data.expressionPass,
        expression_note: data.expressionNote || null,
        internet_sense_pass: data.internetSensePass,
        internet_sense_note: data.internetSenseNote || null,
        resilience_pass: data.resiliencePass,
        resilience_note: data.resilienceNote || null,
        operator_user_id: data.operatorUserId || null,
        business_review_count: count,
        suggested_grade: grade,
        status: nextStatus,
        updated_at: new Date(),
      })
      .where(eq(business_recruitment_candidate.id, data.id));
    await tx.insert(business_recruitment_event).values({
      candidate_id: data.id,
      actor_user_id: access.actorUserId,
      event_type: "business_review_saved",
      from_status: before.status,
      to_status: nextStatus,
      payload: { passCount: count, suggestedGrade: grade, advance: data.advance },
    });
  });
  await writeAuditLog({
    user_id: access.actorUserId,
    action: "business_recruitment.business_review",
    target_type: "business_recruitment_candidate",
    target_id: data.id,
    before: { status: before.status },
    after: { status: nextStatus, passCount: count, suggestedGrade: grade },
  });
  return { ok: true };
}

export async function saveRecruitmentOperationReview(input: unknown): Promise<{ ok: true }> {
  const data = SaveRecruitmentOperationReviewInput.parse(input);
  const access = await resolveRecruitmentAccess();
  requirePoint(access.canReviewOperation, "无运营复评权限");
  const before = await findVisibleRecruitmentCandidate(data.id, access);
  const nextStatus =
    data.advance && before.status === "operation_review" ? "signing" : before.status;
  await db.transaction(async (tx) => {
    await tx
      .update(business_recruitment_candidate)
      .set({
        operation_review_count: data.operationReviewCount,
        final_grade: data.finalGrade,
        operator_user_id: data.operatorUserId || null,
        operation_feedback: data.operationFeedback,
        status: nextStatus,
        updated_at: new Date(),
      })
      .where(eq(business_recruitment_candidate.id, data.id));
    await tx.insert(business_recruitment_event).values({
      candidate_id: data.id,
      actor_user_id: access.actorUserId,
      event_type: "operation_review_saved",
      from_status: before.status,
      to_status: nextStatus,
      payload: {
        passCount: data.operationReviewCount,
        finalGrade: data.finalGrade,
        operatorUserId: data.operatorUserId,
        advance: data.advance,
      },
    });
  });
  await writeAuditLog({
    user_id: access.actorUserId,
    action: "business_recruitment.operation_review",
    target_type: "business_recruitment_candidate",
    target_id: data.id,
    before: { status: before.status },
    after: { status: nextStatus, finalGrade: data.finalGrade },
  });
  return { ok: true };
}

export async function saveRecruitmentOnboarding(input: unknown): Promise<{ ok: true }> {
  const data = SaveRecruitmentOnboardingInput.parse(input);
  const access = await resolveRecruitmentAccess();
  requirePoint(access.canManageSigning, "无入会签约维护权限");
  const before = await findVisibleRecruitmentCandidate(data.id, access);
  const nextStatus = onboardingStatus(data);
  await db.transaction(async (tx) => {
    await tx
      .update(business_recruitment_candidate)
      .set({
        join_date: data.joinDate || null,
        first_live_date: data.firstLiveDate || null,
        signing_status: data.signingStatus,
        abnormal_note: data.abnormalNote || null,
        status: nextStatus,
        updated_at: new Date(),
      })
      .where(eq(business_recruitment_candidate.id, data.id));
    await tx.insert(business_recruitment_event).values({
      candidate_id: data.id,
      actor_user_id: access.actorUserId,
      event_type: "onboarding_saved",
      from_status: before.status,
      to_status: nextStatus,
      payload: {
        joinDate: data.joinDate,
        firstLiveDate: data.firstLiveDate,
        signingStatus: data.signingStatus,
      },
    });
  });
  await writeAuditLog({
    user_id: access.actorUserId,
    action: "business_recruitment.onboarding",
    target_type: "business_recruitment_candidate",
    target_id: data.id,
    before: { status: before.status },
    after: { status: nextStatus, signingStatus: data.signingStatus },
  });
  return { ok: true };
}
