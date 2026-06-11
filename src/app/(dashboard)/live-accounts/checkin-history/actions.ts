"use server";

import { db } from "@/db/client";
import { dingtalk_user, live_anchor } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getCheckinDay, type CheckinDayResult } from "@/modules/checkin/queries";
import {
  forceEndSession,
  ForceEndPermissionDenied,
  insertManualSession,
  updateSessionAnchor,
  updateSessionTime,
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
  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind !== "ok") return [];

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

export async function insertManualSessionAction(args: {
  liveAccountId: string;
  anchorDingtalkUserId: string;
  startAt: string;
  endAt: string;
  reason?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind !== "ok") return { ok: false, error: "未登录" };

  const startAt = new Date(args.startAt);
  if (Number.isNaN(startAt.getTime())) return { ok: false, error: "开始时间格式错" };
  const endAt = new Date(args.endAt);
  if (Number.isNaN(endAt.getTime())) return { ok: false, error: "结束时间格式错" };

  try {
    await insertManualSession({
      liveAccountId: args.liveAccountId,
      anchorDingtalkUserId: args.anchorDingtalkUserId,
      startAt,
      endAt,
      operatorDingtalkUserId: ctx.dingtalkUserId,
      isEmergency: ctx.isEmergency,
      reason: args.reason?.trim() || null,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof ForceEndPermissionDenied) return { ok: false, error: "无权限补时长" };
    const msg = err instanceof Error ? err.message : "未知错误";
    if (msg === "ACCOUNT_NOT_FOUND") return { ok: false, error: "账号不存在" };
    if (msg === "ANCHOR_NOT_FOUND") return { ok: false, error: "主播不存在" };
    if (msg === "INVALID_TIME_RANGE") return { ok: false, error: "结束必须晚于开始" };
    if (msg === "ACCOUNT_HAS_OTHER_IN_PROGRESS")
      return { ok: false, error: "该账号还有进行中场次，会被压住，请先关掉" };
    return { ok: false, error: msg };
  }
}

export async function updateSessionTimeAction(args: {
  sessionId: string;
  /** ISO string，本地时区 */
  newStartAt: string;
  /** ISO string；空字符串 / null = 把 session 重置为 in_progress */
  newEndAt: string | null;
  reason?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind !== "ok") return { ok: false, error: "未登录" };

  const startAt = new Date(args.newStartAt);
  if (Number.isNaN(startAt.getTime())) return { ok: false, error: "开始时间格式错" };
  let endAt: Date | null = null;
  if (args.newEndAt) {
    endAt = new Date(args.newEndAt);
    if (Number.isNaN(endAt.getTime())) return { ok: false, error: "结束时间格式错" };
  }

  try {
    await updateSessionTime({
      sessionId: args.sessionId,
      newStartAt: startAt,
      newEndAt: endAt,
      operatorDingtalkUserId: ctx.dingtalkUserId,
      isEmergency: ctx.isEmergency,
      reason: args.reason?.trim() || null,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof ForceEndPermissionDenied) return { ok: false, error: "无权限改时间" };
    const msg = err instanceof Error ? err.message : "未知错误";
    if (msg === "SESSION_NOT_FOUND") return { ok: false, error: "记录不存在" };
    if (msg === "INVALID_TIME_RANGE") return { ok: false, error: "结束必须晚于开始" };
    if (msg === "ACCOUNT_HAS_OTHER_IN_PROGRESS")
      return { ok: false, error: "该账号已有进行中场次，不能再开一个" };
    return { ok: false, error: msg };
  }
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
