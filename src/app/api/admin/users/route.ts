import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { dingtalk_user } from "@/db/schema";
import { resolvePermission } from "@/modules/permissions";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

export async function GET() {
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

  const users = await db
    .select({
      user_id: dingtalk_user.user_id,
      name: dingtalk_user.name,
      title: dingtalk_user.title,
      dept_ids: dingtalk_user.dept_ids,
    })
    .from(dingtalk_user)
    .where(eq(dingtalk_user.active, true))
    .limit(500);

  const enriched = await Promise.all(
    users.map(async (u) => {
      const p = await resolvePermission(u.user_id);
      return { ...u, scope: p.scope };
    }),
  );

  return NextResponse.json({ users: enriched });
}
