import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { resolveDingtalkIdentityByAuthUserId } from "./dingtalk-identity";

/**
 * Page-level 用户身份解析。所有需要权限过滤的 server component / server action 调用，
 * 用这个 helper 拿到当前钉钉用户 user_id + 是否走 emergency 模式。
 *
 * 返回值约定：
 *   { kind: "ok", dingtalkUserId, isEmergency }
 *   { kind: "unauth" }              — 未登录
 *   { kind: "user_not_synced" }     — 已登录但钉钉 unionId 没匹配到本企业在职员工
 *
 * emergency 模式：当 session.user.email === 'emergency@qjhy.local' 时返回 isEmergency=true
 * 且 dingtalkUserId = session.user.id（仅作占位用，emergency 应当跳过 scope 过滤）。
 */
export async function getCurrentDingtalkUser(): Promise<
  | {
      kind: "ok";
      dingtalkUserId: string;
      isEmergency: boolean;
      dingtalkUnionId: string | null;
    }
  | { kind: "unauth" }
  | { kind: "user_not_synced"; dingtalkUnionId: string | null }
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { kind: "unauth" };

  const isEmergency = session.user.email === "emergency@qjhy.local";
  if (isEmergency) {
    return {
      kind: "ok",
      dingtalkUserId: session.user.id,
      dingtalkUnionId: null,
      isEmergency: true,
    };
  }

  const identity = await resolveDingtalkIdentityByAuthUserId(session.user.id);
  if (identity.kind !== "ok") {
    return { kind: "user_not_synced", dingtalkUnionId: identity.dingtalkUnionId };
  }
  return {
    kind: "ok",
    dingtalkUserId: identity.dingtalkUserId,
    dingtalkUnionId: identity.dingtalkUnionId,
    isEmergency: false,
  };
}
