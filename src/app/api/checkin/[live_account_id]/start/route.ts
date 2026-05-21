import { NextRequest, NextResponse } from "next/server";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { isAnchor, startSession } from "@/modules/checkin/server";
import { notifyDingtalk } from "@/lib/notify";
import { db } from "@/db/client";
import { live_account, dingtalk_user } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ live_account_id: string }> },
): Promise<NextResponse> {
  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind === "unauth") return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (ctx.kind === "user_not_synced")
    return NextResponse.json({ error: "AUTH_USER_NOT_SYNCED" }, { status: 403 });
  if (ctx.isEmergency)
    return NextResponse.json({ error: "EMERGENCY_NOT_ALLOWED" }, { status: 403 });

  const dingtalkUserId = ctx.dingtalkUserId;
  const allowed = await isAnchor(dingtalkUserId);
  if (!allowed) return NextResponse.json({ error: "NOT_AN_ANCHOR" }, { status: 403 });

  const { live_account_id } = await params;
  try {
    const result = await startSession(live_account_id, dingtalkUserId);
    void notifyStart(live_account_id, dingtalkUserId, result.closed_previous);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "UNKNOWN";
    if (msg === "ALREADY_LIVE")
      return NextResponse.json({ error: "ALREADY_LIVE" }, { status: 400 });
    console.error("[checkin/start]", e);
    return NextResponse.json({ error: "INTERNAL", detail: msg }, { status: 500 });
  }
}

async function notifyStart(
  liveAccountId: string,
  anchorDingtalkUserId: string,
  closedPrevious: { previous_anchor_name: string; duration_seconds: number } | null,
): Promise<void> {
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
    const ctx: Record<string, unknown> = {};
    if (closedPrevious) {
      ctx.previous_anchor = closedPrevious.previous_anchor_name;
      ctx.previous_duration = fmtDur(closedPrevious.duration_seconds);
    }
    await notifyDingtalk({
      title: "主播上播",
      detail: `${anchorName} → ${accountLabel}`,
      context: Object.keys(ctx).length > 0 ? ctx : undefined,
    });
  } catch (err) {
    console.error("[checkin/notify-start]", err);
  }
}

function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h${m}m`;
  return `${m}m`;
}
