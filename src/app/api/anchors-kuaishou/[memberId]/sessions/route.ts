import { NextRequest, NextResponse } from "next/server";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { listKuaishouLiveSessions, queryKuaishouMemberSummary } from "@/modules/anchors/server";

/**
 * GET /api/anchors-kuaishou/[memberId]/sessions?days=30
 * 返回某主播指定时间窗内的场次列表 + KPI 汇总。
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
  const sp = req.nextUrl.searchParams;
  const days = Math.min(Math.max(Number(sp.get("days") ?? 30), 1), 365);

  const [sessions, kpi] = await Promise.all([
    listKuaishouLiveSessions(memberId, days),
    queryKuaishouMemberSummary(memberId, days),
  ]);

  return NextResponse.json({ kpi, sessions, days });
}
