import { isNotificationEnabled } from "@/lib/notify/settings";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { endSession } from "@/modules/checkin/server";
import { notifyDingtalk } from "@/lib/notify";
import { db } from "@/db/client";
import { live_account, dingtalk_user } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ live_account_id: string }> },
): Promise<NextResponse> {
  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind === "unauth") return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (ctx.kind === "user_not_synced")
    return NextResponse.json({ error: "AUTH_USER_NOT_SYNCED" }, { status: 403 });
  if (ctx.isEmergency)
    return NextResponse.json({ error: "EMERGENCY_NOT_ALLOWED" }, { status: 403 });

  const { live_account_id } = await params;
  const body = (await req.json().catch(() => ({}))) as { session_id?: string };
  if (!body.session_id) return NextResponse.json({ error: "MISSING_SESSION_ID" }, { status: 400 });

  try {
    const result = await endSession(body.session_id, ctx.dingtalkUserId);
    void notifyEnd(live_account_id, ctx.dingtalkUserId, result.duration_seconds);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "UNKNOWN";
    if (
      msg === "SESSION_NOT_FOUND" ||
      msg === "NOT_YOUR_SESSION" ||
      msg === "SESSION_NOT_IN_PROGRESS"
    ) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[checkin/end]", e);
    return NextResponse.json({ error: "INTERNAL", detail: msg }, { status: 500 });
  }
}

async function notifyEnd(
  liveAccountId: string,
  anchorDingtalkUserId: string,
  durationSeconds: number,
): Promise<void> {
  if (!(await isNotificationEnabled("live_checkin"))) return;
  try {
    const [acc] = await db
      .select({
        placement_label: live_account.placement_label,
        account_name: live_account.account_name,
      })
      .from(live_account)
      .where(eq(live_account.id, liveAccountId));
    const [anchor] = await db
      .select({ name: dingtalk_user.name })
      .from(dingtalk_user)
      .where(eq(dingtalk_user.user_id, anchorDingtalkUserId));
    const accountLabel = acc?.placement_label ?? acc?.account_name ?? liveAccountId;
    const anchorName = anchor?.name ?? anchorDingtalkUserId;
    const h = Math.floor(durationSeconds / 3600);
    const m = Math.floor((durationSeconds % 3600) / 60);
    const dur = h > 0 ? `${h}h${m}m` : `${m}m`;
    await notifyDingtalk({
      title: "主播下播",
      detail: `${anchorName} ← ${accountLabel}`,
      context: { 累计: dur },
    });
  } catch (err) {
    console.error("[checkin/notify-end]", err);
  }
}
