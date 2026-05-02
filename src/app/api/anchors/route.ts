import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { dingtalk_user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { listAnchors } from "@/modules/anchors/server";
import { AnchorListFiltersSchema } from "@/modules/anchors";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Resolve dingtalk user_id from session (better-auth user.id = dingtalk unionid)
  const isEmergency = session.user.email === "emergency@qjhy.local";
  let dingtalkUserId: string;

  if (isEmergency) {
    // Emergency admin sees all — use a sentinel that resolvePermission handles as admin
    // Fall back: find the emergency user by email in dingtalk_user is N/A.
    // For emergency admin, we pass session.user.id and let resolvePermission return "all"
    // (emergency user has an override row with scope=all from seeding)
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
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  const parseResult = AnchorListFiltersSchema.safeParse({
    date_from: sp.get("date_from") ?? sp.get("date") ?? yesterday,
    date_to: sp.get("date_to") ?? sp.get("date") ?? yesterday,
    project: sp.get("project") ?? undefined,
    broker_ids: sp.getAll("broker_id").filter(Boolean),
    health_min: sp.get("health_min") ? Number(sp.get("health_min")) : undefined,
    search: sp.get("search") ?? undefined,
  });

  if (!parseResult.success) {
    return NextResponse.json(
      { error: "INVALID_PARAMS", issues: parseResult.error.issues },
      { status: 400 },
    );
  }

  const rows = await listAnchors(dingtalkUserId, parseResult.data);
  return NextResponse.json({ rows });
}
