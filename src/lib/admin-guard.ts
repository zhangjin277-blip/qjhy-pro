import { auth } from "@/lib/auth";
import { resolveDingtalkIdentityByAuthUserId } from "@/lib/auth/dingtalk-identity";
import { AppError } from "@/lib/errors";
import { resolvePermission } from "@/modules/permissions/server";
import { hasPoint, MODULE_POINTS, type ModuleKey } from "@/modules/permissions";
import type { ResolvedPermission } from "@/modules/permissions";
import { headers } from "next/headers";

async function resolveCaller(): Promise<
  { kind: "emergency"; userId: string } | { kind: "user"; userId: string }
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new AppError("AUTH_NOT_LOGGED_IN", "未登录", 401);
  if (session.user.email === "emergency@qjhy.local") {
    return { kind: "emergency", userId: session.user.id };
  }
  const identity = await resolveDingtalkIdentityByAuthUserId(session.user.id);
  if (identity.kind !== "ok") {
    throw new AppError("AUTH_USER_NOT_SYNCED", "钉钉账号未同步", 403);
  }
  return { kind: "user", userId: identity.dingtalkUserId };
}

/**
 * 校验当前调用者在某板块开通了指定权限点（spec 2026-07-06 权限点细分）。
 * 应急后门跳过（perm 返回 null）。
 */
export async function requirePoint(
  module: ModuleKey,
  point: string,
): Promise<{ userId: string; perm: ResolvedPermission | null }> {
  const caller = await resolveCaller();
  if (caller.kind === "emergency") return { userId: caller.userId, perm: null };
  const perm = await resolvePermission(caller.userId, module);
  if (!hasPoint(perm, point)) {
    const label = MODULE_POINTS[module].find((p) => p.key === point)?.label ?? `${module}.${point}`;
    throw new AppError("AUTH_FORBIDDEN", `无「${label}」权限`, 403);
  }
  return { userId: caller.userId, perm };
}

/**
 * 校验当前调用者可进入管理面板；不能用于敏感操作的授权。
 * 判定：permissions 板块开通任意权限点。写操作须使用 requirePoint。应急后门通过。
 */
export async function requireAdmin(): Promise<{ userId: string }> {
  const caller = await resolveCaller();
  if (caller.kind === "emergency") return { userId: caller.userId };
  const perm = await resolvePermission(caller.userId, "permissions");
  if (perm.points.size === 0) {
    throw new AppError("AUTH_FORBIDDEN", "需要管理员权限", 403);
  }
  return { userId: caller.userId };
}
