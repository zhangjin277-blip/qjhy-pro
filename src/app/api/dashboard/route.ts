import { NextRequest, NextResponse } from "next/server";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import {
  getDashboardOverview,
  resolveDashboardScope,
  type DashboardScope,
} from "@/modules/dashboard/server";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const currentUser = await getCurrentDingtalkUser();
  if (currentUser.kind === "unauth") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (currentUser.kind === "user_not_synced") {
    return NextResponse.json({ error: "AUTH_USER_NOT_SYNCED" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const today = new Date().toISOString().slice(0, 10);

  const dateFrom = sp.get("date_from") ?? today;
  const dateTo = sp.get("date_to") ?? today;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return NextResponse.json({ error: "INVALID_DATE" }, { status: 400 });
  }
  if (dateFrom > dateTo) {
    return NextResponse.json({ error: "DATE_FROM_AFTER_TO" }, { status: 400 });
  }

  // 解析 dashboard scope：emergency 直接 all；钉钉用户走本企业 user_id 权限
  let scope: DashboardScope;
  if (currentUser.isEmergency) {
    scope = { kind: "all" };
  } else {
    scope = await resolveDashboardScope(currentUser.dingtalkUserId);
  }

  try {
    const data = await getDashboardOverview(dateFrom, dateTo, scope);
    return NextResponse.json(data);
  } catch (e) {
    console.error("[/api/dashboard]", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: "INTERNAL", detail: msg }, { status: 500 });
  }
}
