import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { kuaishou_ai_comic_video_snapshot } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";

/**
 * 快手漫剧数据适配入口。
 *
 * 页面只读快手 AI 漫剧快照表。抓取和 Cookie 使用在 Worker/同步任务中完成，
 * 避免 Next 请求进程加载 Puppeteer。
 */
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
  const from = incoming.searchParams.get("from");
  const to = incoming.searchParams.get("to");
  const toDate =
    to ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
  const fallback = new Date(`${toDate}T00:00:00+08:00`);
  fallback.setDate(fallback.getDate() - 29);
  const fromDate =
    from ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(fallback);
  const rows = await db
    .select()
    .from(kuaishou_ai_comic_video_snapshot)
    .where(
      and(
        gte(kuaishou_ai_comic_video_snapshot.publish_time, new Date(`${fromDate}T00:00:00+08:00`)),
        lt(
          kuaishou_ai_comic_video_snapshot.publish_time,
          new Date(new Date(`${toDate}T00:00:00+08:00`).getTime() + 86_400_000),
        ),
        ...(itemId ? [eq(kuaishou_ai_comic_video_snapshot.item_id, itemId)] : []),
      ),
    )
    .orderBy(desc(kuaishou_ai_comic_video_snapshot.snapshot_date));
  const seen = new Set<string>();
  const videos = rows.filter((row) => {
    if (seen.has(row.item_id)) return false;
    seen.add(row.item_id);
    return true;
  });
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
    platform: "kuaishou",
    from: fromDate,
    to: toDate,
    daily: [...daily.values()],
    videos,
    history: itemId ? rows : [],
    hourlyHistory: [],
  });
}
