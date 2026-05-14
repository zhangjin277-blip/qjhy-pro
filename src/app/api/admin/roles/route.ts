import { db } from "@/db/client";
import { role_default_permission } from "@/db/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { isAppError } from "@/lib/errors";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json(
      { error: isAppError(err) ? err.code : "AUTH_FORBIDDEN" },
      { status: isAppError(err) ? err.httpStatus : 403 },
    );
  }

  const roles = await db
    .select()
    .from(role_default_permission)
    .orderBy(role_default_permission.position);
  return NextResponse.json({ roles });
}
