import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PROJECT_KEYS } from "@/modules/dashboard";
import { MINI_PROGRAM_METRICS } from "@/modules/miniprogram";
import {
  getMiniProgramMetricDetail,
  resolveMiniProgramIdentity,
} from "@/modules/miniprogram/server";

const QuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  project: z.enum(PROJECT_KEYS),
  metric: z.enum(MINI_PROGRAM_METRICS),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  const search = request.nextUrl.searchParams;
  const parsed = QuerySchema.safeParse({
    date: search.get("date"),
    project: search.get("project"),
    metric: search.get("metric"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_FILTERS" }, { status: 400 });
  }

  const identity = await resolveMiniProgramIdentity(request);
  if (identity.kind === "unauth") {
    return NextResponse.json({ error: "MINIPROGRAM_UNAUTHORIZED" }, { status: 401 });
  }
  if (identity.kind === "user_not_synced") {
    return NextResponse.json({ error: "AUTH_USER_NOT_SYNCED" }, { status: 403 });
  }

  try {
    const data = await getMiniProgramMetricDetail(
      parsed.data.date,
      parsed.data.project,
      parsed.data.metric,
      identity,
    );
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[/api/miniprogram/v1/dashboard/detail]", error);
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
}
