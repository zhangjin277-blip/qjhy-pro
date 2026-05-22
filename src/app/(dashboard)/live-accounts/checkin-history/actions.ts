"use server";

import { getCheckinDay, type CheckinDayResult } from "@/modules/checkin/queries";
import { forceEndSession, ForceEndPermissionDenied } from "@/modules/checkin/server";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";

export async function fetchCheckinDay(
  date: string,
  product: string,
): Promise<CheckinDayResult | null> {
  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind !== "ok") return null;
  return await getCheckinDay(date, product || undefined);
}

export interface ForceEndResult {
  ok: boolean;
  error?: string;
  duration_seconds?: number;
}

export async function forceEndSessionAction(args: {
  sessionId: string;
  reason: string;
}): Promise<ForceEndResult> {
  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind !== "ok") return { ok: false, error: "未登录" };
  try {
    const r = await forceEndSession({
      sessionId: args.sessionId,
      operatorDingtalkUserId: ctx.dingtalkUserId,
      isEmergency: ctx.isEmergency,
      reason: args.reason.trim() || null,
    });
    return { ok: true, duration_seconds: r.duration_seconds };
  } catch (err) {
    if (err instanceof ForceEndPermissionDenied) {
      return { ok: false, error: "无强制下播权限" };
    }
    const msg = err instanceof Error ? err.message : "未知错误";
    if (msg === "SESSION_NOT_FOUND") return { ok: false, error: "记录不存在" };
    if (msg === "SESSION_NOT_IN_PROGRESS") return { ok: false, error: "该场次不在进行中" };
    return { ok: false, error: msg };
  }
}
