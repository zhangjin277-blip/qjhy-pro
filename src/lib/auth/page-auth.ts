import "server-only";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { auth_user, dingtalk_user } from "@/db/schema";
import { resolveDingtalkIdentityByAuthUserId } from "./dingtalk-identity";
import { AppError } from "@/lib/errors";

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

  // 重新查 auth_user 拿最新的 isActive / expireAt / isExternal
  // （session.user 是签发时快照，禁用/过期需要实时校验）
  const [user] = await db
    .select({
      id: auth_user.id,
      email: auth_user.email,
      isExternal: auth_user.isExternal,
      isActive: auth_user.isActive,
      expireAt: auth_user.expireAt,
    })
    .from(auth_user)
    .where(eq(auth_user.id, session.user.id));

  if (!user) return { kind: "unauth" };

  // 账号已禁用 / 过期 → 一律按未登录处理
  if (!user.isActive) return { kind: "unauth" };
  if (user.expireAt && user.expireAt.getTime() < Date.now()) {
    return { kind: "unauth" };
  }

  // emergency 应急后门
  if (user.email === "emergency@qjhy.local") {
    return {
      kind: "ok",
      dingtalkUserId: session.user.id,
      dingtalkUnionId: null,
      isEmergency: true,
    };
  }

  // 邀请码注册的外部用户：通过 dingtalk_user.auth_user_id 反查 ext_<uuid>
  if (user.isExternal) {
    const [ext] = await db
      .select({ user_id: dingtalk_user.user_id })
      .from(dingtalk_user)
      .where(eq(dingtalk_user.auth_user_id, session.user.id));
    if (!ext) return { kind: "user_not_synced", dingtalkUnionId: null };
    return {
      kind: "ok",
      dingtalkUserId: ext.user_id,
      dingtalkUnionId: null,
      isEmergency: false,
    };
  }

  // 钉钉 OAuth 用户：走原路径
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

/**
 * 任意已登录用户均可调用的 Server Action 鉴权辅助。
 *
 * 与 requireAdmin（admin-guard.ts）的区别：
 *   - requireAdmin  → 仅 can_admin=true 的用户（权限管理专用）
 *   - requireUser   → 任意已登录的在职员工（运营、剪辑、admin 皆可）
 *
 * 返回 { userId: string }，userId 为钉钉 user_id（emergency 模式下为 auth_user.id）。
 * 未登录 / 账号失效 / 钉钉未同步均抛 AppError。
 */
export async function requireUser(): Promise<{ userId: string }> {
  const identity = await getCurrentDingtalkUser();
  if (identity.kind === "unauth") {
    throw new AppError("AUTH_NOT_LOGGED_IN", "未登录", 401);
  }
  if (identity.kind === "user_not_synced") {
    throw new AppError(
      "AUTH_USER_NOT_SYNCED",
      "当前钉钉账号不在本企业通讯录或已离职，无法操作",
      403,
    );
  }
  return { userId: identity.dingtalkUserId };
}
