import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { audit_log, dingtalk_user } from "@/db/schema";
import { resolvePermission } from "@/modules/permissions/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "AUTH_NOT_LOGGED_IN" }, { status: 401 });

  const isEmergency = session.user.email === "emergency@qjhy.local";
  if (!isEmergency) {
    const [du] = await db
      .select({ user_id: dingtalk_user.user_id })
      .from(dingtalk_user)
      .where(eq(dingtalk_user.unionid, session.user.id));
    if (!du) return NextResponse.json({ error: "AUTH_USER_NOT_SYNCED" }, { status: 403 });
    const perm = await resolvePermission(du.user_id);
    if (!perm.can_admin) return NextResponse.json({ error: "AUTH_FORBIDDEN" }, { status: 403 });
  }

  const url = new URL(req.url);
  const limitParam = Number(url.searchParams.get("limit") ?? 200);
  const limit = Math.min(Math.max(limitParam, 1), 500);

  const logs = await db.select().from(audit_log).orderBy(desc(audit_log.created_at)).limit(limit);
  return NextResponse.json({ logs });
}
