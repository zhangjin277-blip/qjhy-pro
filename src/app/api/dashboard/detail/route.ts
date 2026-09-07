import { NextRequest, NextResponse } from "next/server";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import {
  getDrawerDetail,
  resolveDashboardScope,
  type DashboardScope,
} from "@/modules/dashboard/server";
import {
  PROJECT_KEYS,
  type DrawerDetailFilters,
  type DrawerMetric,
  type GroupKey,
  type ProjectKey,
} from "@/modules/dashboard";

const PROJECT_SET: ReadonlySet<ProjectKey> = new Set(PROJECT_KEYS);
const GROUP_SET: ReadonlySet<GroupKey> = new Set(["all", "online", "offline", "other"]);
const METRIC_SET: ReadonlySet<DrawerMetric> = new Set([
  "total_fan_ticket",
  "flow",
  "active_anchor_count",
  "new_anchor_count",
  "first_live_anchor_count",
  "live_flow",
  "video_flow",
  "install_or_activate",
  "show_uv",
  "watch_uv",
]);

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
  const projectRaw = sp.get("project");
  const groupRaw = sp.get("group");
  const metricRaw = sp.get("metric");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return NextResponse.json({ error: "INVALID_DATE" }, { status: 400 });
  }
  if (dateFrom > dateTo) {
    return NextResponse.json({ error: "DATE_FROM_AFTER_TO" }, { status: 400 });
  }
  if (projectRaw && !PROJECT_SET.has(projectRaw as ProjectKey)) {
    return NextResponse.json({ error: "INVALID_PROJECT" }, { status: 400 });
  }
  if (groupRaw && !GROUP_SET.has(groupRaw as GroupKey)) {
    return NextResponse.json({ error: "INVALID_GROUP" }, { status: 400 });
  }
  if (metricRaw && !METRIC_SET.has(metricRaw as DrawerMetric)) {
    return NextResponse.json({ error: "INVALID_METRIC" }, { status: 400 });
  }

  const filters: DrawerDetailFilters = {
    project: (projectRaw as ProjectKey | null) ?? undefined,
    group: (groupRaw as GroupKey | null) ?? undefined,
    date_from: dateFrom,
    date_to: dateTo,
    metric: (metricRaw as DrawerMetric | null) ?? undefined,
  };

  let scope: DashboardScope;
  if (currentUser.isEmergency) {
    scope = { kind: "all" };
  } else {
    scope = await resolveDashboardScope(currentUser.dingtalkUserId);
  }

  try {
    const data = await getDrawerDetail(filters, scope);
    return NextResponse.json(data);
  } catch (e) {
    console.error("[/api/dashboard/detail]", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: "INTERNAL", detail: msg }, { status: 500 });
  }
}
