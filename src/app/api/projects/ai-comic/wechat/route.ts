import { and, desc, eq, gte, lt } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { wechat_ai_comic_daily, wechat_ai_comic_video_snapshot } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";

const date = (v: string | null, fallback: string) =>
  v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback;
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
const next = (v: string) => new Date(`${v}T00:00:00+08:00`).getTime() + 86_400_000;
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const identity = await getCurrentDingtalkUser();
  if (identity.kind !== "ok") return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!identity.isEmergency) {
    const permission = await resolvePermission(identity.dingtalkUserId, "project_ai_comic");
    if (permission.scope === "none" && permission.points.size === 0)
      return NextResponse.json({ error: "无权访问 AI漫剧" }, { status: 403 });
  }
  const url = new URL(request.url);
  const to = date(url.searchParams.get("to"), today());
  const from = date(url.searchParams.get("from"), "2000-01-01");
  const itemId = url.searchParams.get("item_id");
  const daily = await db
    .select()
    .from(wechat_ai_comic_daily)
    .where(
      and(
        gte(wechat_ai_comic_daily.metric_date, from),
        lt(wechat_ai_comic_daily.metric_date, new Date(next(to)).toISOString().slice(0, 10)),
      ),
    )
    .orderBy(wechat_ai_comic_daily.metric_date);
  const snapshots = await db
    .select()
    .from(wechat_ai_comic_video_snapshot)
    .where(
      and(
        gte(wechat_ai_comic_video_snapshot.publish_time, new Date(`${from}T00:00:00+08:00`)),
        lt(wechat_ai_comic_video_snapshot.publish_time, new Date(next(to))),
        lt(
          wechat_ai_comic_video_snapshot.snapshot_date,
          new Date(next(to)).toISOString().slice(0, 10),
        ),
        ...(itemId ? [eq(wechat_ai_comic_video_snapshot.item_id, itemId)] : []),
      ),
    )
    .orderBy(desc(wechat_ai_comic_video_snapshot.snapshot_date));
  const seen = new Set<string>();
  const videos = snapshots.filter((row) => !seen.has(row.item_id) && seen.add(row.item_id));
  const mappedDaily = daily.map((row) => ({
    metric_date: row.metric_date,
    publish_count: row.publish_count ?? 0,
    play_count: row.play_count ?? 0,
    like_count: row.like_count ?? 0,
    comment_count: row.comment_count ?? 0,
    share_count: row.share_count ?? 0,
    net_fans_count: row.net_fans_count ?? 0,
  }));
  return NextResponse.json({
    platform: "wechat",
    from,
    to,
    daily: mappedDaily,
    videos,
    history: itemId ? snapshots : [],
    hourlyHistory: [],
  });
}
