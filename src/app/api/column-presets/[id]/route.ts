import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { dingtalk_user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { UpdatePresetSchema } from "@/modules/column-presets";
import { updateUserPreset, deleteUserPreset } from "@/modules/column-presets/server";

async function resolveUserId(): Promise<string | NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const isEmergency = session.user.email === "emergency@qjhy.local";
  if (isEmergency) return session.user.id;
  const [du] = await db
    .select({ user_id: dingtalk_user.user_id })
    .from(dingtalk_user)
    .where(eq(dingtalk_user.unionid, session.user.id));
  if (!du) return NextResponse.json({ error: "AUTH_USER_NOT_SYNCED" }, { status: 403 });
  return du.user_id;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const userId = await resolveUserId();
  if (typeof userId !== "string") return userId;
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  const parsed = UpdatePresetSchema.safeParse({ id, ...body });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_PARAMS", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const updated = await updateUserPreset(userId, id, {
    name: parsed.data.name,
    columns: parsed.data.columns,
    project: parsed.data.project,
  });
  if (!updated) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ preset: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const userId = await resolveUserId();
  if (typeof userId !== "string") return userId;
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }
  const ok = await deleteUserPreset(userId, id);
  if (!ok) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
