import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { crawler_cookie_session } from "@/db/schema";
import { requireAdmin } from "@/lib/admin-guard";

export async function GET(): Promise<NextResponse> {
  await requireAdmin();
  const rows = await db
    .select({
      basecamp: crawler_cookie_session.basecamp,
      status: crawler_cookie_session.status,
      captured_at: crawler_cookie_session.captured_at,
      expires_at: crawler_cookie_session.expires_at,
      last_check_at: crawler_cookie_session.last_check_at,
    })
    .from(crawler_cookie_session);
  return NextResponse.json({ cookies: rows });
}
