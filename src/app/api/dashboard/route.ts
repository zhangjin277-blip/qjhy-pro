import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { dingtalk_user } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  getDashboardOverview,
  resolveDashboardScope,
  type DashboardScope,
} from "@/modules/dashboard/server";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  // 解析 dashboard scope：emergency 直接 all；钉钉用户 unionid → user_id → resolveDashboardScope
  let scope: DashboardScope;
  if (session.user.email === "emergency@qjhy.local") {
    scope = { kind: "all" };
  } else {
    const [du] = await db
      .select({ user_id: dingtalk_user.user_id })
      .from(dingtalk_user)
      .where(eq(dingtalk_user.unionid, session.user.id));
    if (!du) return NextResponse.json({ error: "AUTH_USER_NOT_SYNCED" }, { status: 403 });
    scope = await resolveDashboardScope(du.user_id);
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
