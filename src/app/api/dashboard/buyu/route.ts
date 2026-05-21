import { NextRequest, NextResponse } from "next/server";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import {
  queryKpiSummary,
  resolvePlacementScope,
  type KpiSummary,
} from "@/modules/placement/server";

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

  const scope = await resolvePlacementScope(currentUser.dingtalkUserId, currentUser.isEmergency);
  if (scope.kind === "reject") {
    const empty: KpiSummary = {
      cost: 0,
      activations: 0,
      payment: 0,
      roi: 0,
      cpa: 0,
      prev: { cost: 0, activations: 0, payment: 0, roi: 0, cpa: 0 },
      daily: [],
    };
    return NextResponse.json(empty);
  }

  try {
    const data = await queryKpiSummary({
      date_from: dateFrom,
      date_to: dateTo,
      dataset_ids: ["product_buyu"],
      scope,
    });
    return NextResponse.json(data);
  } catch (e) {
    console.error("[/api/dashboard/buyu]", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: "INTERNAL", detail: msg }, { status: 500 });
  }
}
