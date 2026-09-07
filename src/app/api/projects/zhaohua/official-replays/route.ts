import { and, desc, gte, lt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { zhaohua_official_replay } from "@/db/schema";
import { requireUser } from "@/lib/auth/page-auth";
import { AppError } from "@/lib/errors";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function nextDate(date: string): Date {
  return new Date(new Date(`${date}T00:00:00+08:00`).getTime() + 86_400_000);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.code }, { status: error.httpStatus });
    }
    throw error;
  }
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  if ((from && !DATE_PATTERN.test(from)) || (to && !DATE_PATTERN.test(to))) {
    return NextResponse.json({ error: "日期格式应为 YYYY-MM-DD" }, { status: 400 });
  }
  if (from && to && from > to) {
    return NextResponse.json({ error: "开始日期不能晚于结束日期" }, { status: 400 });
  }

  const conditions = [];
  if (from)
    conditions.push(gte(zhaohua_official_replay.started_at, new Date(`${from}T00:00:00+08:00`)));
  if (to) conditions.push(lt(zhaohua_official_replay.started_at, nextDate(to)));

  const rows = await db
    .select({
      roomId: zhaohua_official_replay.room_id,
      account: zhaohua_official_replay.account_name,
      title: zhaohua_official_replay.title,
      startedAt: zhaohua_official_replay.started_at,
      endedAt: zhaohua_official_replay.ended_at,
      durationSeconds: zhaohua_official_replay.duration_seconds,
      exposureUv: zhaohua_official_replay.exposure_uv,
      enterRoomUv: zhaohua_official_replay.enter_room_uv,
      enterRoomRate: zhaohua_official_replay.enter_room_rate,
      avgOnline: zhaohua_official_replay.avg_online,
      peakOnline: zhaohua_official_replay.peak_online,
      avgWatchSeconds: zhaohua_official_replay.avg_watch_seconds,
      soundWave: zhaohua_official_replay.sound_wave,
      giftUsers: zhaohua_official_replay.gift_users,
      newFollowers: zhaohua_official_replay.new_followers,
      commentUsers: zhaohua_official_replay.comment_users,
      likeCount: zhaohua_official_replay.like_count,
      shareCount: zhaohua_official_replay.share_count,
      fanClubUsers: zhaohua_official_replay.fan_club_users,
      gameRevenue: zhaohua_official_replay.game_revenue,
      gameActivations: zhaohua_official_replay.game_activations,
      gamePurchases: zhaohua_official_replay.game_purchases,
      syncedAt: zhaohua_official_replay.synced_at,
    })
    .from(zhaohua_official_replay)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(zhaohua_official_replay.started_at))
    .limit(500);

  return NextResponse.json({ rows });
}
