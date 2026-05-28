"use server";

import { db } from "@/db/client";
import { dingtalk_user, live_anchor } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getCheckinDay, type CheckinDayResult } from "@/modules/checkin/queries";
import {
  forceEndSession,
  ForceEndPermissionDenied,
  updateSessionAnchor,
} from "@/modules/checkin/server";
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

export async function listAnchorsForCorrection(): Promise<
  { id: string; realName: string; externalName: string | null }[]
> {
  const rows = await db
    .select({
      id: dingtalk_user.user_id,
      real_name: dingtalk_user.name,
      external_name: live_anchor.external_name,
    })
    .from(dingtalk_user)
    .leftJoin(live_anchor, eq(live_anchor.dingtalk_user_id, dingtalk_user.user_id))
    .where(
      and(
        eq(dingtalk_user.active, true),
        sql`${dingtalk_user.dept_ids} ?| ARRAY['728935814','928732653','932021044','929188023']::text[]`,
      ),
    )
    .orderBy(dingtalk_user.name);
  return rows.map((r) => ({
    id: r.id,
    realName: r.real_name,
    externalName: r.external_name,
  }));
}

export async function updateSessionAnchorAction(args: {
  sessionId: string;
  newAnchorDingtalkUserId: string;
  reason?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind !== "ok") return { ok: false, error: "未登录" };
  try {
    await updateSessionAnchor({
      sessionId: args.sessionId,
      newAnchorDingtalkUserId: args.newAnchorDingtalkUserId,
      operatorDingtalkUserId: ctx.dingtalkUserId,
      isEmergency: ctx.isEmergency,
      reason: args.reason?.trim() || null,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof ForceEndPermissionDenied) return { ok: false, error: "无权限" };
    const msg = err instanceof Error ? err.message : "未知错误";
    if (msg === "SESSION_NOT_FOUND") return { ok: false, error: "记录不存在" };
    return { ok: false, error: msg };
  }
}
