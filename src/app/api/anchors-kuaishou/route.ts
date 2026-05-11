import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { dingtalk_user } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  listKuaishouAnchors,
  listKuaishouAnchorsPrev,
  queryKuaishouAnchorKpi,
  type KuaishouAnchorListFilters,
} from "@/modules/anchors/server";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isEmergency = session.user.email === "emergency@qjhy.local";
  let dingtalkUserId: string;
  if (isEmergency) {
    dingtalkUserId = session.user.id;
  } else {
    const [du] = await db
      .select({ user_id: dingtalk_user.user_id })
      .from(dingtalk_user)
      .where(eq(dingtalk_user.unionid, session.user.id));
    if (!du) return NextResponse.json({ error: "AUTH_USER_NOT_SYNCED" }, { status: 403 });
    dingtalkUserId = du.user_id;
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
    listKuaishouAnchors(dingtalkUserId, filters, isEmergency),
    listKuaishouAnchorsPrev(dingtalkUserId, filters, isEmergency),
    queryKuaishouAnchorKpi(dingtalkUserId, filters, isEmergency),
  ]);
  return NextResponse.json({ rows, previousRows, kpi });
}
