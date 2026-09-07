import "server-only";

import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  business_recruitment_candidate,
  business_recruitment_event,
  anchor_profile,
  anchor_daily,
  dingtalk_user,
  live_anchor,
  user_position_override,
} from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { AppError } from "@/lib/errors";

import {
  findVisibleRecruitmentCandidate,
  recruitmentScopeCondition,
  resolveRecruitmentAccess,
} from "./authz";
import {
  createRecruitmentImportTemplate,
  parseRecruitmentWorkbook,
  type ImportPlatform,
  type RecruitmentImportIssue,
  type RecruitmentImportRow,
} from "./import-workbook";
import type {
  RecruitmentBoardData,
  RecruitmentCandidateDetail,
  RecruitmentEventView,
  RecruitmentListRow,
  RecruitmentPerformanceSummary,
} from "./types";
export { listRecruitmentCenter } from "./center-server";
export { importPipelineWorkbook } from "./center-import-server";
import { countBusinessReview, recommendRecruitmentGrade, type RecruitmentStatus } from "./workflow";

function iso(value: Date): string {
  return value.toISOString();
}

async function userNameMap(userIds: (string | null)[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();
  const users = await db
    .select({ userId: dingtalk_user.user_id, name: dingtalk_user.name })
    .from(dingtalk_user)
    .where(inArray(dingtalk_user.user_id, ids));
  return new Map(users.map((user) => [user.userId, user.name]));
}

function toListRow(
  row: typeof business_recruitment_candidate.$inferSelect,
  names: Map<string, string>,
  profile?: AnchorProfileView,
  performance?: RecruitmentPerformanceSummary | null,
): RecruitmentListRow {
  return {
    id: row.id,
    platform: row.platform,
    gameProduct: row.game_product,
    anchorName: row.anchor_name,
    accountNickname: row.account_nickname,
    accountId: row.account_id,
    platformNickname: profile?.nickName ?? null,
    platformAvatar: profile?.avatar ?? null,
    platformUid: profile?.anchorId ?? row.uid ?? null,
    recruiterName: names.get(row.recruiter_user_id) ?? "应急管理员",
    businessReviewCount: row.business_review_count,
    finalGrade: row.final_grade,
    suggestedGrade: row.suggested_grade,
    operatorName: row.operator_user_id ? (names.get(row.operator_user_id) ?? "未知运营") : null,
    status: row.status,
    updatedAt: iso(row.updated_at),
    joinDate: row.join_date,
    firstLiveDate: row.first_live_date,
    platformExitStatus: profile?.exitStatus ?? null,
    performance30d: performance ?? null,
  };
}

interface AnchorProfileView {
  anchorId: string;
  nickName: string | null;
  avatar: string | null;
  awemeDisplayId: string | null;
  awemeShortId: string | null;
  exitStatus: "withdrawn" | "cancelled" | null;
}

function profileMatchesCandidate(
  profile: Pick<AnchorProfileView, "anchorId" | "awemeDisplayId" | "awemeShortId">,
  accountId: string,
  uid: string | null,
): boolean {
  return (
    profile.awemeDisplayId === accountId ||
    profile.awemeShortId === accountId ||
    Boolean(uid && profile.anchorId === uid)
  );
}

async function recruitmentAnchorProfiles(
  rows: { accountId: string; uid: string | null }[],
): Promise<Map<string, AnchorProfileView>> {
  const accountIds = [...new Set(rows.map((row) => row.accountId.trim()).filter(Boolean))];
  const uids = [
    ...new Set(
      rows.map((row) => row.uid?.trim()).filter((value): value is string => Boolean(value)),
    ),
  ];
  const conditions = [];
  if (accountIds.length > 0) {
    conditions.push(
      inArray(anchor_profile.aweme_display_id, accountIds),
      inArray(anchor_profile.aweme_short_id, accountIds),
    );
  }
  if (uids.length > 0) conditions.push(inArray(anchor_profile.anchor_id, uids));
  if (conditions.length === 0) return new Map();
  const profiles = await db
    .select({
      anchorId: anchor_profile.anchor_id,
      nickName: anchor_profile.nick_name,
      avatar: anchor_profile.avatar,
      awemeDisplayId: anchor_profile.aweme_display_id,
      awemeShortId: anchor_profile.aweme_short_id,
      waitForLeave: anchor_profile.wait_for_leave,
    })
    .from(anchor_profile)
    .where(or(...conditions));
  const result = new Map<string, AnchorProfileView>();
  for (const row of rows) {
    const profile = profiles.find((item) =>
      profileMatchesCandidate(item, row.accountId.trim(), row.uid),
    );
    if (profile) {
      const exitStatus = profile.nickName?.includes("账号已注销")
        ? "cancelled"
        : profile.waitForLeave === true
          ? "withdrawn"
          : null;
      result.set(`${row.accountId}\u0000${row.uid ?? ""}`, {
        anchorId: profile.anchorId,
        nickName: profile.nickName,
        avatar: profile.avatar,
        awemeDisplayId: profile.awemeDisplayId,
        awemeShortId: profile.awemeShortId,
        exitStatus,
      });
    }
  }
  return result;
}

async function recruitmentPerformance30d(
  profiles: Map<string, AnchorProfileView>,
): Promise<Map<string, RecruitmentPerformanceSummary>> {
  const anchorIds = [...new Set([...profiles.values()].map((profile) => profile.anchorId))];
  if (anchorIds.length === 0) return new Map();
  const from = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  const rows = await db
    .select({
      anchorId: anchor_daily.anchor_id,
      liveDays: sql<number>`COUNT(*) FILTER (WHERE ${anchor_daily.live_duration_1d} > 0)`,
      validLiveDuration: sql<string>`COALESCE(SUM(${anchor_daily.valid_live_duration_1d}), 0)`,
      totalFanTicket: sql<number>`COALESCE(SUM(${anchor_daily.total_fan_ticket}), 0)`,
      newFollowFans: sql<number>`COALESCE(SUM(${anchor_daily.new_follow_fans_1d}), 0)`,
    })
    .from(anchor_daily)
    .where(and(inArray(anchor_daily.anchor_id, anchorIds), sql`${anchor_daily.date} >= ${from}`))
    .groupBy(anchor_daily.anchor_id);
  return new Map(
    rows.map((row) => [
      row.anchorId,
      {
        liveDays: Number(row.liveDays ?? 0),
        validLiveDuration: Number(row.validLiveDuration ?? 0),
        totalFanTicket: Number(row.totalFanTicket ?? 0),
        newFollowFans: Number(row.newFollowFans ?? 0),
      },
    ]),
  );
}

function profileForRow(
  row: { accountId: string; uid: string | null },
  profiles: Map<string, AnchorProfileView>,
): AnchorProfileView | undefined {
  return profiles.get(`${row.accountId}\u0000${row.uid ?? ""}`);
}

export async function listRecruitmentBoard(): Promise<RecruitmentBoardData> {
  const access = await resolveRecruitmentAccess();
  const scopeCondition = await recruitmentScopeCondition(access);
  const rows = await db
    .select()
    .from(business_recruitment_candidate)
    .where(scopeCondition)
    .orderBy(desc(business_recruitment_candidate.updated_at));
  const profiles = await recruitmentAnchorProfiles(
    rows.map((row) => ({ accountId: row.account_id, uid: row.uid })),
  );
  const performance = await recruitmentPerformance30d(profiles);
  const names = await userNameMap(
    rows.flatMap((row) => [row.recruiter_user_id, row.operator_user_id]),
  );
  const staff = await db
    .select({ userId: dingtalk_user.user_id, name: dingtalk_user.name })
    .from(dingtalk_user)
    .leftJoin(live_anchor, eq(live_anchor.dingtalk_user_id, dingtalk_user.user_id))
    .leftJoin(user_position_override, eq(user_position_override.user_id, dingtalk_user.user_id))
    .where(
      and(
        eq(dingtalk_user.active, true),
        or(isNull(live_anchor.dingtalk_user_id), eq(user_position_override.position, "运营")),
      ),
    )
    .orderBy(asc(dingtalk_user.name));

  return {
    rows: rows.map((row) =>
      (() => {
        const profile = profileForRow({ accountId: row.account_id, uid: row.uid }, profiles);
        return toListRow(
          row,
          names,
          profile,
          profile ? (performance.get(profile.anchorId) ?? null) : null,
        );
      })(),
    ),
    staff,
    capabilities: {
      actorUserId: access.actorUserId,
      canEditCandidate: access.canEditCandidate,
      canReviewOperation: access.canReviewOperation,
      canManageSigning: access.canManageSigning,
      canManageDemand: access.canManageDemand,
    },
  };
}

export async function getRecruitmentCandidateDetail(
  id: string,
): Promise<RecruitmentCandidateDetail> {
  const access = await resolveRecruitmentAccess();
  const row = await findVisibleRecruitmentCandidate(id, access);
  const events = await db
    .select({
      id: business_recruitment_event.id,
      actorUserId: business_recruitment_event.actor_user_id,
      eventType: business_recruitment_event.event_type,
      fromStatus: business_recruitment_event.from_status,
      toStatus: business_recruitment_event.to_status,
      payload: business_recruitment_event.payload,
      createdAt: business_recruitment_event.created_at,
    })
    .from(business_recruitment_event)
    .where(eq(business_recruitment_event.candidate_id, id))
    .orderBy(desc(business_recruitment_event.created_at));
  const names = await userNameMap([
    row.recruiter_user_id,
    row.operator_user_id,
    ...events.map((event) => event.actorUserId),
  ]);
  const profiles = await recruitmentAnchorProfiles([{ accountId: row.account_id, uid: row.uid }]);
  const profile = profileForRow({ accountId: row.account_id, uid: row.uid }, profiles);
  const eventViews: RecruitmentEventView[] = events.map((event) => ({
    id: event.id,
    actorName: event.actorUserId ? (names.get(event.actorUserId) ?? null) : null,
    eventType: event.eventType,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    payload: event.payload,
    createdAt: iso(event.createdAt),
  }));

  return {
    ...toListRow(row, names, profile),
    gender: row.gender,
    phone: row.phone,
    uid: row.uid,
    followerCount: row.follower_count,
    accountSummary: row.account_summary,
    policy: row.policy,
    recruiterUserId: row.recruiter_user_id,
    equipmentStatus: row.equipment_status,
    willingness: row.willingness,
    appearancePass: row.appearance_pass,
    appearanceNote: row.appearance_note,
    voicePass: row.voice_pass,
    voiceNote: row.voice_note,
    expressionPass: row.expression_pass,
    expressionNote: row.expression_note,
    internetSensePass: row.internet_sense_pass,
    internetSenseNote: row.internet_sense_note,
    resiliencePass: row.resilience_pass,
    resilienceNote: row.resilience_note,
    operationReviewCount: row.operation_review_count,
    operatorUserId: row.operator_user_id,
    operationFeedback: row.operation_feedback,
    joinDate: row.join_date,
    firstLiveDate: row.first_live_date,
    signingStatus: row.signing_status,
    abnormalNote: row.abnormal_note,
    createdAt: iso(row.created_at),
    events: eventViews,
  };
}

function importedStatus(row: RecruitmentImportRow): RecruitmentStatus {
  if (row.firstLiveDate) return "live";
  if (row.signingStatus === "declined") return "rejected";
  if (row.signingStatus === "signed") return "signed";
  if (
    row.joinDate ||
    row.operationReviewCount !== null ||
    row.finalGrade ||
    row.operatorName ||
    row.operationFeedback
  ) {
    return "signing";
  }
  if (
    row.equipmentStatus ||
    row.willingness ||
    row.policy ||
    row.appearancePass ||
    row.voicePass ||
    row.expressionPass ||
    row.internetSensePass ||
    row.resiliencePass
  ) {
    return "operation_review";
  }
  return "business_review";
}

export interface RecruitmentImportResult {
  imported: number;
  skipped: number;
  issues: RecruitmentImportIssue[];
}

export async function importRecruitmentWorkbook(
  buffer: Buffer,
  defaultPlatform: ImportPlatform,
): Promise<RecruitmentImportResult> {
  const access = await resolveRecruitmentAccess();
  if (!access.canEditCandidate) {
    throw new AppError("AUTH_FORBIDDEN", "无候选人批量导入权限", 403);
  }
  const parsed = parseRecruitmentWorkbook(buffer, defaultPlatform);
  if (parsed.rows.length === 0) {
    return { imported: 0, skipped: parsed.issues.length, issues: parsed.issues };
  }

  const [existing, activeUsers] = await Promise.all([
    db
      .select({
        platform: business_recruitment_candidate.platform,
        accountId: business_recruitment_candidate.account_id,
      })
      .from(business_recruitment_candidate),
    db
      .select({ userId: dingtalk_user.user_id, name: dingtalk_user.name })
      .from(dingtalk_user)
      .where(eq(dingtalk_user.active, true))
      .orderBy(asc(dingtalk_user.name)),
  ]);
  const existingKeys = new Set(existing.map((row) => `${row.platform}\u0000${row.accountId}`));
  const staffByName = new Map<string, string>();
  for (const user of activeUsers) {
    if (!staffByName.has(user.name)) staffByName.set(user.name, user.userId);
  }

  const candidateValues: (typeof business_recruitment_candidate.$inferInsert)[] = [];
  const eventValues: (typeof business_recruitment_event.$inferInsert)[] = [];
  const issues = [...parsed.issues];
  let skipped = parsed.issues.filter((issue) => issue.row > 0).length;
  for (const row of parsed.rows) {
    const key = `${row.platform}\u0000${row.accountId}`;
    if (existingKeys.has(key)) {
      issues.push({ row: row.sourceRow, message: "该平台账号已存在，已跳过" });
      skipped += 1;
      continue;
    }
    existingKeys.add(key);
    const operatorUserId = row.operatorName ? staffByName.get(row.operatorName) : undefined;
    if (row.operatorName && !operatorUserId) {
      issues.push({ row: row.sourceRow, message: `未匹配到带教运营“${row.operatorName}”，已留空` });
    }
    const recruiterUserId =
      (row.recruiterName ? staffByName.get(row.recruiterName) : undefined) ?? access.actorUserId;
    const businessReviewCount = countBusinessReview(row);
    const suggestedGrade = recommendRecruitmentGrade(businessReviewCount);
    const status = importedStatus(row);
    const id = crypto.randomUUID();
    candidateValues.push({
      id,
      platform: row.platform,
      game_product: row.gameProduct,
      anchor_name: row.anchorName,
      gender: row.gender,
      phone: row.phone,
      account_nickname: row.accountNickname,
      account_id: row.accountId,
      uid: row.uid,
      follower_count: row.followerCount,
      account_summary: row.accountSummary,
      policy: row.policy,
      recruiter_user_id: recruiterUserId,
      equipment_status: row.equipmentStatus,
      willingness: row.willingness,
      appearance_pass: row.appearancePass,
      appearance_note: row.appearanceNote,
      voice_pass: row.voicePass,
      voice_note: row.voiceNote,
      expression_pass: row.expressionPass,
      expression_note: row.expressionNote,
      internet_sense_pass: row.internetSensePass,
      internet_sense_note: row.internetSenseNote,
      resilience_pass: row.resiliencePass,
      resilience_note: row.resilienceNote,
      business_review_count: businessReviewCount,
      operation_review_count: row.operationReviewCount,
      suggested_grade: suggestedGrade,
      final_grade: row.finalGrade,
      operator_user_id: operatorUserId ?? null,
      operation_feedback: row.operationFeedback,
      join_date: row.joinDate,
      first_live_date: row.firstLiveDate,
      signing_status: row.signingStatus,
      status,
      created_by_user_id: access.actorUserId,
    });
    eventValues.push({
      candidate_id: id,
      actor_user_id: access.actorUserId,
      event_type: "candidate_imported",
      from_status: null,
      to_status: status,
      payload: { sourceRow: row.sourceRow, platform: row.platform, accountId: row.accountId },
    });
  }

  if (candidateValues.length > 0) {
    await db.transaction(async (tx) => {
      await tx.insert(business_recruitment_candidate).values(candidateValues);
      await tx.insert(business_recruitment_event).values(eventValues);
    });
    await writeAuditLog({
      user_id: access.actorUserId,
      action: "business_recruitment.bulk_import",
      target_type: "business_recruitment_candidate",
      target_id: `batch:${crypto.randomUUID()}`,
      after: { imported: candidateValues.length, issueCount: issues.length },
    });
  }

  return {
    imported: candidateValues.length,
    skipped,
    issues: issues.slice(0, 100),
  };
}

export async function getRecruitmentImportTemplate(): Promise<Buffer> {
  const access = await resolveRecruitmentAccess();
  if (!access.canEditCandidate) {
    throw new AppError("AUTH_FORBIDDEN", "无候选人批量导入权限", 403);
  }
  return createRecruitmentImportTemplate();
}
