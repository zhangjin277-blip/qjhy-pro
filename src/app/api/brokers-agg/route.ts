import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { dingtalk_user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getBrokerAggregates } from "@/modules/dashboard/server";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Resolve dingtalk user_id from session (same pattern as dashboard/cards)
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

  const date =
    req.nextUrl.searchParams.get("date") ??
    new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

  const rows = await getBrokerAggregates(dingtalkUserId, date);
  return NextResponse.json({ rows });
}
