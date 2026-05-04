import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getDrawerDetail } from "@/modules/dashboard/server";
import type { DrawerDetailFilters, GroupKey, ProjectKey } from "@/modules/dashboard";

const PROJECT_SET: ReadonlySet<ProjectKey> = new Set(["ddz", "three"]);
const GROUP_SET: ReadonlySet<GroupKey> = new Set(["all", "online", "offline", "other"]);

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const today = new Date().toISOString().slice(0, 10);

  const dateFrom = sp.get("date_from") ?? today;
  const dateTo = sp.get("date_to") ?? today;
  const projectRaw = sp.get("project");
  const groupRaw = sp.get("group");

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

  const filters: DrawerDetailFilters = {
    project: (projectRaw as ProjectKey | null) ?? undefined,
    group: (groupRaw as GroupKey | null) ?? undefined,
    date_from: dateFrom,
    date_to: dateTo,
  };

  try {
    const data = await getDrawerDetail(filters);
    return NextResponse.json(data);
  } catch (e) {
    console.error("[/api/dashboard/detail]", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: "INTERNAL", detail: msg }, { status: 500 });
  }
}
