import { NextRequest, NextResponse } from "next/server";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { listAnchors } from "@/modules/anchors/server";
import { AnchorListFiltersSchema } from "@/modules/anchors";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const currentUser = await getCurrentDingtalkUser();
  if (currentUser.kind === "unauth") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (currentUser.kind === "user_not_synced") {
    return NextResponse.json({ error: "AUTH_USER_NOT_SYNCED" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  const parseResult = AnchorListFiltersSchema.safeParse({
    date_from: sp.get("date_from") ?? sp.get("date") ?? yesterday,
    date_to: sp.get("date_to") ?? sp.get("date") ?? yesterday,
    project: sp.get("project") ?? undefined,
    broker_ids: sp.getAll("broker_id").filter(Boolean),
    health_min: sp.get("health_min") ? Number(sp.get("health_min")) : undefined,
    search: sp.get("search") ?? undefined,
    fields: parseFields(sp),
  });

  if (!parseResult.success) {
    return NextResponse.json(
      { error: "INVALID_PARAMS", issues: parseResult.error.issues },
      { status: 400 },
    );
  }

  const filters = parseResult.data;

  const dFrom = new Date(filters.date_from);
  const dTo = new Date(filters.date_to);
  const days = Math.round((dTo.getTime() - dFrom.getTime()) / 86400_000) + 1;

  const rows = await listAnchors(currentUser.dingtalkUserId, filters);
  return NextResponse.json({ rows, days });
}

function parseFields(sp: URLSearchParams): string[] | undefined {
  const values = sp
    .getAll("fields")
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
  return values.length > 0 ? [...new Set(values)] : undefined;
}
