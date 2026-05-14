import { NextRequest, NextResponse } from "next/server";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import {
  listKuaishouAnchors,
  listKuaishouAnchorsPrev,
  queryKuaishouAnchorKpi,
  type KuaishouAnchorListFilters,
} from "@/modules/anchors/server";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const currentUser = await getCurrentDingtalkUser();
  if (currentUser.kind === "unauth") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (currentUser.kind === "user_not_synced") {
    return NextResponse.json({ error: "AUTH_USER_NOT_SYNCED" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const dateFrom = sp.get("date_from") ?? undefined;
  const dateTo = sp.get("date_to") ?? undefined;
  const daysParam = sp.get("days");
  const dsParam = sp.get("data_source");
  const filters: KuaishouAnchorListFilters = {
    product: sp.get("product") ?? "all",
    search: sp.get("search") ?? undefined,
    dateFrom,
    dateTo,
    daysBack: !dateFrom && !dateTo && daysParam ? Math.min(Math.max(Number(daysParam), 1), 365) : 7,
    dataSource: dsParam === "today" || dsParam === "history" || dsParam === "all" ? dsParam : "all",
  };

  const [rows, previousRows, kpi] = await Promise.all([
    listKuaishouAnchors(currentUser.dingtalkUserId, filters, currentUser.isEmergency),
    listKuaishouAnchorsPrev(currentUser.dingtalkUserId, filters, currentUser.isEmergency),
    queryKuaishouAnchorKpi(currentUser.dingtalkUserId, filters, currentUser.isEmergency),
  ]);
  return NextResponse.json({ rows, previousRows, kpi });
}
