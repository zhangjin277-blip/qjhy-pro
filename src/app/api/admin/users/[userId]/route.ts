import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { dingtalk_dept, dingtalk_user, dept_leader } from "@/db/schema";
import { resolvePermission } from "@/modules/permissions/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
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

  const { userId } = await params;

  const [user] = await db.select().from(dingtalk_user).where(eq(dingtalk_user.user_id, userId));
  if (!user) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const targetPerm = await resolvePermission(userId);

  const leaderDepts = await db
    .select({
      dept_id: dept_leader.dept_id,
      name: dingtalk_dept.name,
    })
    .from(dept_leader)
    .innerJoin(dingtalk_dept, eq(dept_leader.dept_id, dingtalk_dept.dept_id))
    .where(eq(dept_leader.user_id, userId));

  return NextResponse.json({
    user_id: user.user_id,
    name: user.name,
    title: user.title,
    dept_ids: user.dept_ids,
    permission: targetPerm,
    managedDepts: leaderDepts,
  });
}
