import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { db } from "@/db/client";
import {
  anchor_profile,
  broker_user_mapping,
  business_recruitment_candidate,
  dingtalk_user,
} from "@/db/schema";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { hasPoint } from "@/modules/permissions";
import { resolvePermission, getManagedDeptIds } from "@/modules/permissions/server";
import { getAnchorDaily } from "@/modules/anchors/server";
// API route needs the recruitment scope resolver to authorize this cross-module data view.
/* eslint-disable import/no-restricted-paths */
import {
  recruitmentScopeCondition,
  resolveRecruitmentAccess,
} from "@/modules/business-recruitment/authz";
/* eslint-enable import/no-restricted-paths */

const ParamsSchema = z.object({
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

async function canViewViaBusinessRecruitment(anchorId: string): Promise<boolean> {
  const access = await resolveRecruitmentAccess();
  const scopeCondition = await recruitmentScopeCondition(access);
  const [profile] = await db
    .select({
      awemeDisplayId: anchor_profile.aweme_display_id,
      awemeShortId: anchor_profile.aweme_short_id,
    })
    .from(anchor_profile)
    .where(eq(anchor_profile.anchor_id, anchorId))
    .limit(1);
  if (!profile) return false;

  const accountIds = [profile.awemeDisplayId, profile.awemeShortId].filter(
    (value): value is string => Boolean(value),
  );
  const candidateMatch =
    accountIds.length > 0
      ? or(
          eq(business_recruitment_candidate.uid, anchorId),
          inArray(business_recruitment_candidate.account_id, accountIds),
        )
      : eq(business_recruitment_candidate.uid, anchorId);
  const [candidate] = await db
    .select({ id: business_recruitment_candidate.id })
    .from(business_recruitment_candidate)
    .where(scopeCondition ? and(candidateMatch, scopeCondition) : candidateMatch)
    .limit(1);
  return Boolean(candidate);
}

/**
 * GET /api/anchors/:id/daily?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
 *
 * 返回某主播在指定日期范围的日明细 + 同期对比。
 * 权限：只能看自己 scope 内的主播；不在范围内返回 403。
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const currentUser = await getCurrentDingtalkUser();
  if (currentUser.kind === "unauth") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (currentUser.kind === "user_not_synced") {
    return NextResponse.json({ error: "AUTH_USER_NOT_SYNCED" }, { status: 403 });
  }

  const { id: anchorId } = await ctx.params;
  if (!anchorId) return NextResponse.json({ error: "MISSING_ANCHOR_ID" }, { status: 400 });

  const sp = req.nextUrl.searchParams;
  const parsed = ParamsSchema.safeParse({
    date_from: sp.get("date_from"),
    date_to: sp.get("date_to"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_PARAMS", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { date_from, date_to } = parsed.data;

  if (currentUser.isEmergency) {
    const data = await getAnchorDaily(anchorId, date_from, date_to);
    return NextResponse.json(data);
  }

  // ── 权限检查 ─────────────────────────────────────────────
  const dingtalkUserId = currentUser.dingtalkUserId;
  // 造化项目内的主播明细由项目权限控制，避免用户还要额外开通“主播明细”板块。
  // 仅接受项目页面明确传入的项目标识，不改变主播明细模块其他入口的权限逻辑。
  const project = sp.get("project");
  if (project === "zhaohua") {
    const projectPerm = await resolvePermission(dingtalkUserId, "project_zhaohua");
    if (projectPerm.scope !== "none" || hasPoint(projectPerm, "project_edit")) {
      const data = await getAnchorDaily(anchorId, date_from, date_to);
      return NextResponse.json(data);
    }
  }

  if (
    sp.get("access_context") === "business_recruitment" &&
    (await canViewViaBusinessRecruitment(anchorId))
  ) {
    const data = await getAnchorDaily(anchorId, date_from, date_to);
    return NextResponse.json(data);
  }

  const perm = await resolvePermission(dingtalkUserId, "anchors");
  if (perm.scope === "none") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // 验证 anchor 可见性（scope=all 直接通过）
  if (perm.scope !== "all") {
    let visibleBrokerIds: string[] = [];

    if (perm.scope === "self") {
      const myBroker = await db
        .select({ broker_id: broker_user_mapping.broker_id })
        .from(broker_user_mapping)
        .where(eq(broker_user_mapping.dingtalk_user_id, dingtalkUserId));
      visibleBrokerIds = myBroker.map((m) => m.broker_id);
    } else if (perm.scope === "team") {
      const deptIds = await getManagedDeptIds(dingtalkUserId);
      if (deptIds.length === 0) {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }
      const teamUsers = await db
        .select({ user_id: dingtalk_user.user_id })
        .from(dingtalk_user)
        .where(
          sql`${dingtalk_user.dept_ids} ?| ${sql.raw(`ARRAY[${deptIds.map((d) => `'${d.replace(/'/g, "''")}'`).join(",")}]::text[]`)}`,
        );
      if (teamUsers.length === 0) {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }
      const teamBrokers = await db
        .select({ broker_id: broker_user_mapping.broker_id })
        .from(broker_user_mapping)
        .where(
          inArray(
            broker_user_mapping.dingtalk_user_id,
            teamUsers.map((u) => u.user_id),
          ),
        );
      visibleBrokerIds = teamBrokers.map((m) => m.broker_id);
    }

    if (visibleBrokerIds.length === 0) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const [hit] = await db
      .select({ anchor_id: anchor_profile.anchor_id })
      .from(anchor_profile)
      .where(
        and(
          eq(anchor_profile.anchor_id, anchorId),
          inArray(anchor_profile.broker_id, visibleBrokerIds),
        ),
      )
      .limit(1);
    if (!hit) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
  }

  // ── 拉数据 ─────────────────────────────────────────────
  const data = await getAnchorDaily(anchorId, date_from, date_to);
  return NextResponse.json(data);
}
