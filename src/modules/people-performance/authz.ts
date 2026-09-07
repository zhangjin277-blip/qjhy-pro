import "server-only";

import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { AppError } from "@/lib/errors";
import { resolvePermission } from "@/modules/permissions/server";

export async function resolvePerformanceAccess(): Promise<{
  userId: string;
  isEmergency: boolean;
  scope: "none" | "self" | "team" | "all";
  manageProfiles: boolean;
  calibrate: boolean;
  manageAll: boolean;
}> {
  const identity = await getCurrentDingtalkUser();
  if (identity.kind === "unauth") throw new AppError("AUTH_NOT_LOGGED_IN", "未登录", 401);
  if (identity.kind === "user_not_synced") {
    throw new AppError("AUTH_USER_NOT_SYNCED", "当前钉钉账号未同步", 403);
  }
  if (identity.isEmergency) {
    return {
      userId: identity.dingtalkUserId,
      isEmergency: true,
      scope: "all",
      manageProfiles: true,
      calibrate: true,
      manageAll: true,
    };
  }
  const permission = await resolvePermission(identity.dingtalkUserId, "people_performance");
  return {
    userId: identity.dingtalkUserId,
    isEmergency: false,
    scope: permission.scope,
    manageProfiles: permission.points.has("manage_profiles"),
    calibrate: permission.points.has("calibrate"),
    manageAll: permission.points.has("manage_process"),
  };
}
