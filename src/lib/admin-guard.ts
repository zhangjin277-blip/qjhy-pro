import { db } from "@/db/client";
import { dingtalk_user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { resolvePermission } from "@/modules/permissions/server";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";

/**
 * 校验当前调用者是 admin。
 *
 * better-auth 的 user.id 是钉钉 unionid，但权限模型查的是 dingtalk_user.user_id。
 * 这里通过 unionid → dingtalk_user.user_id 转换后再 resolve。
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

  const [du] = await db
    .select({ user_id: dingtalk_user.user_id })
    .from(dingtalk_user)
    .where(eq(dingtalk_user.unionid, session.user.id));
  if (!du) {
    throw new AppError(
      "AUTH_USER_NOT_SYNCED",
      "用户尚未同步到 dingtalk_user 表，无法计算权限",
      403,
    );
  }

  const perm = await resolvePermission(du.user_id);
  if (!perm.can_admin) {
    throw new AppError("AUTH_FORBIDDEN", "需要管理员权限", 403);
  }
  return { userId: du.user_id };
}
