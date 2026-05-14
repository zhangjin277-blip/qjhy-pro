import { db } from "@/db/client";
import { audit_log } from "@/db/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { isAppError } from "@/lib/errors";
import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json(
      { error: isAppError(err) ? err.code : "AUTH_FORBIDDEN" },
      { status: isAppError(err) ? err.httpStatus : 403 },
    );
  }

  const url = new URL(req.url);
  const limitParam = Number(url.searchParams.get("limit") ?? 200);
  const limit = Math.min(Math.max(limitParam, 1), 500);

  const logs = await db.select().from(audit_log).orderBy(desc(audit_log.created_at)).limit(limit);
  return NextResponse.json({ logs });
}
