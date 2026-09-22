import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { auth } from "@/lib/auth";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import { dedupeOfficialWorks } from "@/modules/ai-comic/video-dedupe";
import {
  zhaohua_official_video_daily,
  zhaohua_official_video_hourly,
  zhaohua_official_video_snapshot,
} from "@/db/schema";

function beijingDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
}

function validDate(value: string | null, fallback: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ? (value as string) : fallback;
}

function nextDate(value: string): string {
  const [year = 1970, month = 1, day = 1] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const identity = await getCurrentDingtalkUser();
  if (identity.kind !== "ok") return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!identity.isEmergency) {
    const permission = await resolvePermission(identity.dingtalkUserId, "project_ai_comic");
    if (permission.scope === "none" && permission.points.size === 0) {
      return NextResponse.json({ error: "无权访问 AI漫剧" }, { status: 403 });
    }
  }
  const url = new URL(request.url);
  const itemId = url.searchParams.get("item_id");
  const accountKey =
    url.searchParams.get("account") === "xiao-mowan" ? "xiao-mowan" : "sun-xiaosheng";
  const to = validDate(url.searchParams.get("to"), beijingDate());
  const fallbackDate = new Date(`${to}T00:00:00+08:00`);
  fallbackDate.setDate(fallbackDate.getDate() - 29);
  const from = validDate(
    url.searchParams.get("from"),
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(fallbackDate),
  );
  const daily = await db
    .select()
    .from(zhaohua_official_video_daily)
    .where(
      and(
        eq(zhaohua_official_video_daily.account_key, accountKey),
        gte(zhaohua_official_video_daily.metric_date, from),
        lt(zhaohua_official_video_daily.metric_date, nextDate(to)),
      ),
    )
    .orderBy(zhaohua_official_video_daily.metric_date);

  // 每小时都会写一份作品快照，取所选截止日之前每个作品的最新一份，避免榜单重复。
  const snapshots = await db
    .select()
    .from(zhaohua_official_video_snapshot)
    .where(
      and(
        eq(zhaohua_official_video_snapshot.account_key, accountKey),
        gte(zhaohua_official_video_snapshot.publish_time, new Date(`${from}T00:00:00+08:00`)),
        lt(
          zhaohua_official_video_snapshot.publish_time,
          new Date(`${nextDate(to)}T00:00:00+08:00`),
        ),
        lt(zhaohua_official_video_snapshot.snapshot_date, nextDate(to)),
        ...(itemId ? [eq(zhaohua_official_video_snapshot.item_id, itemId)] : []),
      ),
    )
    .orderBy(desc(zhaohua_official_video_snapshot.snapshot_date));
  const seen = new Set<string>();
  const latestVideos = snapshots.filter((video) => {
    if (seen.has(video.item_id)) return false;
    seen.add(video.item_id);
    return true;
  });
  const videos = itemId ? latestVideos : dedupeOfficialWorks(latestVideos);
  const hourlyHistory = itemId
    ? await db
        .select()
        .from(zhaohua_official_video_hourly)
        .where(
          and(
            eq(zhaohua_official_video_hourly.account_key, accountKey),
            eq(zhaohua_official_video_hourly.item_id, itemId),
            gte(zhaohua_official_video_hourly.point_at, new Date(`${from}T00:00:00+08:00`)),
            lt(zhaohua_official_video_hourly.point_at, new Date(`${nextDate(to)}T00:00:00+08:00`)),
          ),
        )
        .orderBy(asc(zhaohua_official_video_hourly.point_at))
    : [];

  return NextResponse.json({
    platform: "douyin",
    account: accountKey,
    from,
    to,
    daily,
    videos,
    history: itemId ? snapshots : [],
    hourlyHistory,
  });
}
