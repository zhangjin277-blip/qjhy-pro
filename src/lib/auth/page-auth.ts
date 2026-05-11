import "server-only";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { dingtalk_user } from "@/db/schema";

/**
 * Page-level 用户身份解析。所有需要权限过滤的 server component / server action 调用，
 * 用这个 helper 拿到当前钉钉用户 user_id（已 patch 过 unionid 的）+ 是否走 emergency 模式。
 *
 * 返回值约定：
 *   { kind: "ok", dingtalkUserId, isEmergency }
 *   { kind: "unauth" }              — 未登录
 *   { kind: "user_not_synced" }     — 已登录但 dingtalk_user.unionid 没匹配上 session.user.id
 *
 * emergency 模式：当 session.user.email === 'emergency@qjhy.local' 时返回 isEmergency=true
 * 且 dingtalkUserId = session.user.id（仅作占位用，emergency 应当跳过 scope 过滤）。
 */
export async function getCurrentDingtalkUser(): Promise<
  | { kind: "ok"; dingtalkUserId: string; isEmergency: boolean }
  | { kind: "unauth" }
  | { kind: "user_not_synced" }
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { kind: "unauth" };

  const isEmergency = session.user.email === "emergency@qjhy.local";
  if (isEmergency) {
    return { kind: "ok", dingtalkUserId: session.user.id, isEmergency: true };
  }

  const [du] = await db
    .select({ user_id: dingtalk_user.user_id })
    .from(dingtalk_user)
    .where(eq(dingtalk_user.unionid, session.user.id));
  if (!du) return { kind: "user_not_synced" };
  return { kind: "ok", dingtalkUserId: du.user_id, isEmergency: false };
}
