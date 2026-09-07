import "server-only";

import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db/client";
import {
  business_recruitment_candidate,
  dingtalk_user,
  recruitment_application,
} from "@/db/schema";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { AppError } from "@/lib/errors";
import {
  buildScopeWhereClause,
  getManagedDeptIds,
  resolvePermission,
} from "@/modules/permissions/server";

import type { RecruitmentCapabilities } from "./types";

export interface RecruitmentAccess extends RecruitmentCapabilities {
  isEmergency: boolean;
  scope: "none" | "self" | "team" | "all";
  delegatedUserIds: string[] | null;
  managedDeptIds: string[];
}

export async function resolveRecruitmentAccess(): Promise<RecruitmentAccess> {
  const identity = await getCurrentDingtalkUser();
  if (identity.kind === "unauth") throw new AppError("AUTH_NOT_LOGGED_IN", "未登录", 401);
  if (identity.kind === "user_not_synced") {
    throw new AppError("AUTH_USER_NOT_SYNCED", "当前钉钉账号未同步", 403);
  }
  if (identity.isEmergency) {
    return {
      actorUserId: identity.dingtalkUserId,
      isEmergency: true,
      scope: "all",
      delegatedUserIds: null,
      managedDeptIds: [],
      canEditCandidate: true,
      canReviewOperation: true,
      canManageSigning: true,
      canManageDemand: true,
    };
  }

  const permission = await resolvePermission(identity.dingtalkUserId, "business_recruitment");
  const managedDeptIds =
    permission.scope === "team" ? await getManagedDeptIds(identity.dingtalkUserId) : [];
  return {
    actorUserId: identity.dingtalkUserId,
    isEmergency: false,
    scope: permission.scope,
    delegatedUserIds: permission.delegatedUserIds ?? null,
    managedDeptIds,
    canEditCandidate: permission.points.has("candidate_edit"),
    canReviewOperation: permission.points.has("operation_review"),
    canManageSigning: permission.points.has("signing_manage"),
    canManageDemand: permission.points.has("demand_manage"),
  };
}

export async function teamMemberIds(deptIds: string[]): Promise<string[]> {
  if (deptIds.length === 0) return [];
  const users = await db
    .select({ userId: dingtalk_user.user_id, deptIds: dingtalk_user.dept_ids })
    .from(dingtalk_user)
    .where(eq(dingtalk_user.active, true));
  const allowed = new Set(deptIds);
  return users
    .filter((user) => user.deptIds.some((deptId) => allowed.has(deptId)))
    .map((user) => user.userId);
}

export async function recruitmentCenterScopeCondition(
  access: RecruitmentAccess,
): Promise<SQL | undefined> {
  const delegated = access.delegatedUserIds;
  if (delegated && delegated.length > 0) {
    return inArray(recruitment_application.recruiter_user_id, delegated);
  }

  const clause = buildScopeWhereClause(access.scope, access.actorUserId, access.managedDeptIds);
  if (clause.kind === "none") return undefined;
  if (clause.kind === "reject") return sql`false`;
  if (clause.kind === "self") {
    return eq(recruitment_application.recruiter_user_id, clause.userId);
  }
  const members = await teamMemberIds(clause.deptIds);
  return members.length > 0
    ? inArray(recruitment_application.recruiter_user_id, members)
    : sql`false`;
}

export async function recruitmentScopeCondition(
  access: RecruitmentAccess,
): Promise<SQL | undefined> {
  const delegated = access.delegatedUserIds;
  if (delegated && delegated.length > 0) {
    return or(
      inArray(business_recruitment_candidate.recruiter_user_id, delegated),
      inArray(business_recruitment_candidate.operator_user_id, delegated),
    );
  }

  const clause = buildScopeWhereClause(access.scope, access.actorUserId, access.managedDeptIds);
  if (clause.kind === "none") return undefined;
  if (clause.kind === "reject") return sql`false`;
  if (clause.kind === "self") {
    return or(
      eq(business_recruitment_candidate.recruiter_user_id, clause.userId),
      eq(business_recruitment_candidate.operator_user_id, clause.userId),
    );
  }
  const members = await teamMemberIds(clause.deptIds);
  if (members.length === 0) return sql`false`;
  return or(
    inArray(business_recruitment_candidate.recruiter_user_id, members),
    inArray(business_recruitment_candidate.operator_user_id, members),
  );
}

export async function findVisibleRecruitmentCandidate(id: string, access: RecruitmentAccess) {
  const scopeCondition = await recruitmentScopeCondition(access);
  const [candidate] = await db
    .select()
    .from(business_recruitment_candidate)
    .where(
      scopeCondition
        ? and(eq(business_recruitment_candidate.id, id), scopeCondition)
        : eq(business_recruitment_candidate.id, id),
    );
  if (!candidate) {
    throw new AppError("RECRUITMENT_CANDIDATE_NOT_FOUND", "候选人不存在或无权查看", 404);
  }
  return candidate;
}
