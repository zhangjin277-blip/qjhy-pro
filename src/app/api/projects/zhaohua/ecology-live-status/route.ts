import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { requireUser } from "@/lib/auth/page-auth";

const REALTIME_ACTIVE_WINDOW_MINUTES = 5;

/**
 * Returns the current Douyin live snapshot for the ecology roster.
 * A crawler row seen within five minutes is considered live; this matches the
 * realtime crawler window and deliberately ignores planned shifts.
 */
export async function GET(): Promise<NextResponse> {
  try {
    await requireUser();
    const rows = await db.execute(sql`
      SELECT platform_uid, MAX(start_at) AS start_at
      FROM douyin_live_room
      WHERE last_seen_at > now() - make_interval(mins => ${REALTIME_ACTIVE_WINDOW_MINUTES})
      GROUP BY platform_uid
    `);
    return NextResponse.json({
      rows: (rows as unknown as Record<string, unknown>[]).map((row) => ({
        platformUid: String(row.platform_uid),
        startAt: row.start_at instanceof Date ? row.start_at.toISOString() : String(row.start_at),
      })),
    });
  } catch (error) {
    console.error("[/api/projects/zhaohua/ecology-live-status]", error);
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
}
