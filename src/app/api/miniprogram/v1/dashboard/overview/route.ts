import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMiniProgramDashboard, resolveMiniProgramIdentity } from "@/modules/miniprogram/server";

const QuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

function yesterdayInShanghai(): string {
  const now = new Date();
  const shanghaiToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const yesterday = new Date(`${shanghaiToday}T00:00:00+08:00`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(yesterday);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const parsed = QuerySchema.safeParse({
    date: request.nextUrl.searchParams.get("date") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_DATE" }, { status: 400 });
  }

  const identity = await resolveMiniProgramIdentity(request);
  if (identity.kind === "unauth") {
    return NextResponse.json({ error: "MINIPROGRAM_UNAUTHORIZED" }, { status: 401 });
  }
  if (identity.kind === "user_not_synced") {
    return NextResponse.json({ error: "AUTH_USER_NOT_SYNCED" }, { status: 403 });
  }

  try {
    const data = await getMiniProgramDashboard(parsed.data.date ?? yesterdayInShanghai(), identity);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[/api/miniprogram/v1/dashboard/overview]", error);
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
}
