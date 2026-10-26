import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { crawler_cookie_session } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";

const COOKIE_KEYS = {
  "sun-xiaosheng": {
    douyin: "douyin_creator",
    kuaishou: "kuaishou_creator",
    xiaohongshu: "xiaohongshu_creator",
    bilibili: "bilibili_creator",
    wechat: "wechat_creator",
  },
  "xiao-mowan": {
    douyin: "douyin_creator_xiao_mowan",
  },
} as const;

export async function GET(request: Request): Promise<NextResponse> {
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

  const account =
    new URL(request.url).searchParams.get("account") === "xiao-mowan"
      ? "xiao-mowan"
      : "sun-xiaosheng";
  const rows = await db
    .select({
      basecamp: crawler_cookie_session.basecamp,
      status: crawler_cookie_session.status,
    })
    .from(crawler_cookie_session);
  const statusByCookie = new Map(rows.map((row) => [row.basecamp, row.status]));
  const statuses = Object.fromEntries(
    Object.entries(COOKIE_KEYS[account]).map(([platform, cookieKey]) => [
      platform,
      statusByCookie.get(cookieKey) ?? "missing",
    ]),
  );

  return NextResponse.json({ account, statuses });
}
