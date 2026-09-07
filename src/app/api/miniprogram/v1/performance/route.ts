import { type NextRequest, NextResponse } from "next/server";
import { OperationMonth } from "@/modules/operation-performance";
import { getOperationPerformance } from "@/modules/operation-performance/server";
import { resolveMiniProgramIdentity } from "@/modules/miniprogram/server";

function currentMonth(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const parsed = OperationMonth.safeParse(
    request.nextUrl.searchParams.get("month") ?? currentMonth(),
  );
  if (!parsed.success) return NextResponse.json({ error: "INVALID_MONTH" }, { status: 400 });
  const identity = await resolveMiniProgramIdentity(request);
  if (identity.kind === "unauth")
    return NextResponse.json({ error: "MINIPROGRAM_UNAUTHORIZED" }, { status: 401 });
  if (identity.kind === "user_not_synced")
    return NextResponse.json({ error: "AUTH_USER_NOT_SYNCED" }, { status: 403 });
  try {
    const data = await getOperationPerformance(identity.dingtalkUserId, parsed.data);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[/api/miniprogram/v1/performance]", error);
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
}
