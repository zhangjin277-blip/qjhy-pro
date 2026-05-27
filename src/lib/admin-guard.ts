import { auth } from "@/lib/auth";
import { resolveDingtalkIdentityByAuthUserId } from "@/lib/auth/dingtalk-identity";
import { AppError } from "@/lib/errors";
import { resolvePermission } from "@/modules/permissions/server";
import type { ModuleKey } from "@/modules/permissions";
import { headers } from "next/headers";

/**
 * 校验当前调用者对某板块有 can_edit 权限（业务级编辑）。
 * 应急后门跳过。
 */
export async function requireModuleEdit(module: ModuleKey): Promise<{ userId: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new AppError("AUTH_NOT_LOGGED_IN", "未登录", 401);
  if (session.user.email === "emergency@qjhy.local") {
    return { userId: session.user.id };
  }
  const identity = await resolveDingtalkIdentityByAuthUserId(session.user.id);
  if (identity.kind !== "ok") {
    throw new AppError("AUTH_USER_NOT_SYNCED", "钉钉账号未同步", 403);
  }
  const perm = await resolvePermission(identity.dingtalkUserId, module);
  if (!perm.can_edit) {
    throw new AppError("AUTH_FORBIDDEN", `无 ${module} 编辑权限`, 403);
  }
  return { userId: identity.dingtalkUserId };
}

/**
 * 校验当前调用者是 admin。
 *
 * better-auth 的 user.id 是 auth_user.id，权限模型查的是 dingtalk_user.user_id。
 * 这里通过 auth_account 里的钉钉 unionId 转换后再 resolve。
 *
 * 应急后门用户（emergency-admin）拥有 admin 权限。
 */
export async function requireAdmin(): Promise<{ userId: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new AppError("AUTH_NOT_LOGGED_IN", "未登录", 401);
  }

  if (session.user.email === "emergency@qjhy.local") {
    return { userId: session.user.id };
  }

  const identity = await resolveDingtalkIdentityByAuthUserId(session.user.id);
  if (identity.kind !== "ok") {
    throw new AppError(
      "AUTH_USER_NOT_SYNCED",
      "当前钉钉账号不在本企业通讯录或已离职，无法计算权限",
      403,
    );
  }

  // can_admin 用 'permissions' 板块的权限位作为判断依据：
  // 该位为 true 才允许进入权限管理 / 审计等管理面板。
  const perm = await resolvePermission(identity.dingtalkUserId, "permissions");
  if (!perm.can_admin) {
    throw new AppError("AUTH_FORBIDDEN", "需要管理员权限", 403);
  }
  return { userId: identity.dingtalkUserId };
}
