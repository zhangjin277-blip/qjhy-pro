import "server-only";

import { and, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import {
  anchor_daily,
  anchor_profile,
  business_recruitment_candidate,
  dingtalk_user,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import { getManagedDeptIds, resolvePermission } from "@/modules/permissions/server";

import { resolveRecruitmentAccess } from "./authz";
import { calculateRecruitmentStatistics, type RecruitmentStatisticsData } from "./statistics";

export const RecruitmentStatisticsInput = z
  .object({
    month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/, "请选择有效的统计月份"),
    recruiterUserId: z.string().min(1).max(200).optional(),
  })
  .strict();

/** Scope applies to recruiter ownership, never operator assignments or delegation. */
export async function getRecruitmentStatistics(input: unknown): Promise<RecruitmentStatisticsData> {
  const data = RecruitmentStatisticsInput.parse(input);
  const access = await resolveRecruitmentAccess();
  if (access.scope === "none") throw new AppError("AUTH_FORBIDDEN", "无线上招募统计权限", 403);
  const canViewAll =
    access.isEmergency ||
    (await resolvePermission(access.actorUserId, "permissions")).points.size > 0;
  const managedDeptIds =
    canViewAll || access.scope === "self"
      ? []
      : access.scope === "team"
        ? access.managedDeptIds
        : await getManagedDeptIds(access.actorUserId);
  const canViewTeam = !canViewAll && managedDeptIds.length > 0;
  const members = canViewTeam
    ? await db.execute<{ user_id: string }>(sql`
        WITH RECURSIVE managed AS (
          SELECT dept_id FROM dingtalk_dept
          WHERE dept_id IN (${sql.join(
            managedDeptIds.map((id) => sql`${id}`),
            sql`, `,
          )})
          UNION
          SELECT d.dept_id FROM dingtalk_dept d JOIN managed m ON d.parent_id = m.dept_id
        )
        SELECT u.user_id FROM dingtalk_user u
        WHERE EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(u.dept_ids) dept(id)
          JOIN managed m ON m.dept_id = dept.id
        )
      `)
    : [];
  const allowedOwnerIds = [...new Set([access.actorUserId, ...members.map((row) => row.user_id)])];
  if (!canViewAll && data.recruiterUserId && !allowedOwnerIds.includes(data.recruiterUserId)) {
    throw new AppError("AUTH_FORBIDDEN", "无权查看该经纪人的招募统计", 403);
  }
  const visible = await db
    .select()
    .from(business_recruitment_candidate)
    .where(
      canViewAll
        ? undefined
        : inArray(business_recruitment_candidate.recruiter_user_id, allowedOwnerIds),
    );
  const ownerIds = [
    ...new Set([
      ...(canViewAll ? [] : allowedOwnerIds),
      ...visible.map((row) => row.recruiter_user_id),
    ]),
  ];
  const users = ownerIds.length
    ? await db
        .select({ userId: dingtalk_user.user_id, name: dingtalk_user.name })
        .from(dingtalk_user)
        .where(inArray(dingtalk_user.user_id, ownerIds))
    : [];
  const names = new Map(users.map((user) => [user.userId, user.name]));
  const candidates = visible;
  // Only Douyin daily facts are currently collected; never match other platforms by ID.
  const douyin = candidates.filter((candidate) => candidate.platform === "douyin");
  const accountIds = [
    ...new Set(douyin.map((candidate) => candidate.account_id.trim()).filter(Boolean)),
  ];
  const uids = [
    ...new Set(douyin.map((candidate) => candidate.uid?.trim()).filter((id): id is string => !!id)),
  ];
  const conditions = [];
  if (accountIds.length)
    conditions.push(
      inArray(anchor_profile.aweme_display_id, accountIds),
      inArray(anchor_profile.aweme_short_id, accountIds),
    );
  if (uids.length) conditions.push(inArray(anchor_profile.anchor_id, uids));
  const profiles = conditions.length
    ? await db
        .select({
          anchorId: anchor_profile.anchor_id,
          accountId: anchor_profile.aweme_display_id,
          shortId: anchor_profile.aweme_short_id,
        })
        .from(anchor_profile)
        .where(or(...conditions))
    : [];
  const matched = candidates.map((candidate) => {
    const matches =
      candidate.platform === "douyin"
        ? profiles.filter(
            (profile) =>
              profile.accountId === candidate.account_id.trim() ||
              profile.shortId === candidate.account_id.trim() ||
              (!!candidate.uid?.trim() && profile.anchorId === candidate.uid.trim()),
          )
        : [];
    return {
      id: candidate.id,
      recruiterUserId: candidate.recruiter_user_id,
      recruiterName: names.get(candidate.recruiter_user_id) ?? "未同步人员",
      anchorName: candidate.anchor_name,
      accountId: candidate.account_id,
      joinDate: candidate.join_date,
      firstLiveDate: candidate.first_live_date,
      anchorId: matches.length === 1 ? (matches[0]?.anchorId ?? null) : null,
    };
  });
  // Multiple registrations pointing at one UID need correction before awarding achievements.
  const counts = new Map<string, number>();
  for (const row of matched)
    if (row.anchorId) counts.set(row.anchorId, (counts.get(row.anchorId) ?? 0) + 1);
  for (const row of matched)
    if (row.anchorId && (counts.get(row.anchorId) ?? 0) > 1) row.anchorId = null;
  const selected = matched.filter(
    (row) => !data.recruiterUserId || row.recruiterUserId === data.recruiterUserId,
  );
  const anchorIds = selected.flatMap((row) => (row.anchorId ? [row.anchorId] : []));
  const monthEnd = `${data.month}-32`;
  const days = anchorIds.length
    ? await db
        .select({
          anchorId: anchor_daily.anchor_id,
          date: anchor_daily.date,
          hours: anchor_daily.live_duration_1d,
        })
        .from(anchor_daily)
        .where(and(inArray(anchor_daily.anchor_id, anchorIds), lt(anchor_daily.date, monthEnd)))
    : [];
  const calculated = calculateRecruitmentStatistics(data.month, selected, days);
  return {
    month: data.month,
    canViewAll,
    canViewTeam,
    recruiters: ownerIds.map((userId) => ({ userId, name: names.get(userId) ?? "未同步人员" })),
    ...calculated,
  };
}
