import { NextRequest, NextResponse } from "next/server";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { getCheckinState, isAnchor } from "@/modules/checkin/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ live_account_id: string }> },
): Promise<NextResponse> {
  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind === "unauth") return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (ctx.kind === "user_not_synced")
    return NextResponse.json({ error: "AUTH_USER_NOT_SYNCED" }, { status: 403 });

  // 与 start/end 一致：仅主播部门 / 个人白名单允许访问。
  // emergency 模式同样限制（admin 没有打卡场景需求）。
  if (ctx.isEmergency)
    return NextResponse.json({ error: "EMERGENCY_NOT_ALLOWED" }, { status: 403 });
  const allowed = await isAnchor(ctx.dingtalkUserId);
  if (!allowed) return NextResponse.json({ error: "NOT_AN_ANCHOR" }, { status: 403 });

  const { live_account_id } = await params;
  const state = await getCheckinState(live_account_id);
  if (!state) return NextResponse.json({ error: "ACCOUNT_NOT_FOUND" }, { status: 404 });
  return NextResponse.json(state);
}
