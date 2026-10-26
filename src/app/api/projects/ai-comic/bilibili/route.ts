import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { bilibili_ai_comic_video_snapshot } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";

const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
const validDate = (value: string | null, fallback: string) =>
  value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;

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

  const incoming = new URL(request.url);
  const itemId = incoming.searchParams.get("item_id");
  const toDate = validDate(incoming.searchParams.get("to"), today());
  const fallback = new Date(`${toDate}T00:00:00+08:00`);
  fallback.setDate(fallback.getDate() - 29);
  const fromDate = validDate(
    incoming.searchParams.get("from"),
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(fallback),
  );
  const nextDate = new Date(new Date(`${toDate}T00:00:00+08:00`).getTime() + 86_400_000);

  const rows = await db
    .select()
    .from(bilibili_ai_comic_video_snapshot)
    .where(
      and(
        gte(bilibili_ai_comic_video_snapshot.publish_time, new Date(`${fromDate}T00:00:00+08:00`)),
        lt(bilibili_ai_comic_video_snapshot.publish_time, nextDate),
        ...(itemId ? [eq(bilibili_ai_comic_video_snapshot.item_id, itemId)] : []),
      ),
    )
    .orderBy(desc(bilibili_ai_comic_video_snapshot.snapshot_date));
  const seriesRows = rows.filter((row) => /\bep\s*\.?\s*\d+/i.test(row.description ?? ""));
  const seen = new Set<string>();
  const videos = seriesRows.filter((row) => !seen.has(row.item_id) && seen.add(row.item_id));
  const daily = new Map<
    string,
    {
      metric_date: string;
      publish_count: number;
      play_count: number;
      like_count: number;
      comment_count: number;
      share_count: number;
      net_fans_count: number;
    }
  >();
  for (const video of videos) {
    const date = video.publish_time.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
    const item = daily.get(date) ?? {
      metric_date: date,
      publish_count: 0,
      play_count: 0,
      like_count: 0,
      comment_count: 0,
      share_count: 0,
      net_fans_count: 0,
    };
    item.publish_count += 1;
    item.play_count += video.view_count ?? 0;
    item.like_count += video.like_count ?? 0;
    item.comment_count += video.comment_count ?? 0;
    item.share_count += video.share_count ?? 0;
    item.net_fans_count += video.subscribe_count ?? 0;
    daily.set(date, item);
  }

  return NextResponse.json({
    platform: "bilibili",
    from: fromDate,
    to: toDate,
    daily: [...daily.values()],
    videos,
      history: itemId
      ? seriesRows.map((row) => ({ ...row, created_at: row.collected_at.toISOString() }))
      : [],
    hourlyHistory: [],
  });
}
