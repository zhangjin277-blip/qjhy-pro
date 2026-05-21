import { NextRequest, NextResponse } from "next/server";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { listKuaishouLiveSessions, queryKuaishouMemberSummary } from "@/modules/anchors/server";
import { resolvePermission, getManagedDeptIds } from "@/modules/permissions/server";
import { db } from "@/db/client";
import { dingtalk_user, kuaishou_member } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * GET /api/anchors-kuaishou/[memberId]/sessions?days=30
 * 返回某主播指定时间窗内的场次列表 + KPI 汇总。
 *
 * 权限：与 listKuaishouAnchors 对齐——
 *   scope=all → 通过；scope=team → memberId 的运营 ∈ team；
 *   scope=self → memberId 的运营 = 自己；scope=none → 403。
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ memberId: string }> },
): Promise<NextResponse> {
  const currentUser = await getCurrentDingtalkUser();
  if (currentUser.kind === "unauth") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (currentUser.kind === "user_not_synced") {
    return NextResponse.json({ error: "AUTH_USER_NOT_SYNCED" }, { status: 403 });
  }

  const { memberId } = await ctx.params;

  // ── 权限校验 ──────────────────────────────────────────────────
  if (!currentUser.isEmergency) {
    const perm = await resolvePermission(currentUser.dingtalkUserId, "anchors");
    if (perm.scope === "none") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    if (perm.scope !== "all") {
      const [member] = await db
        .select({ agent: kuaishou_member.agent_dingtalk_user_id })
        .from(kuaishou_member)
        .where(eq(kuaishou_member.user_id, memberId));
      if (!member) {
        return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
      }
      const agent = member.agent;

      if (perm.scope === "self") {
        if (agent !== currentUser.dingtalkUserId) {
          return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
        }
      } else {
        // scope === "team"
        const deptIds = await getManagedDeptIds(currentUser.dingtalkUserId);
        if (deptIds.length === 0 || !agent) {
          return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
        }
        const teamUsers = await db
          .select({ user_id: dingtalk_user.user_id })
          .from(dingtalk_user)
          .where(
            sql`${dingtalk_user.dept_ids} ?| ${sql.raw(`ARRAY[${deptIds.map((d) => `'${d.replace(/'/g, "''")}'`).join(",")}]::text[]`)}`,
          );
        const allowed = new Set(teamUsers.map((u) => u.user_id));
        if (!allowed.has(agent)) {
          return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
        }
      }
    }
  }

  const sp = req.nextUrl.searchParams;
  const days = Math.min(Math.max(Number(sp.get("days") ?? 30), 1), 365);

  const [sessions, kpi] = await Promise.all([
    listKuaishouLiveSessions(memberId, days),
    queryKuaishouMemberSummary(memberId, days),
  ]);

  return NextResponse.json({ kpi, sessions, days });
}
