import "server-only";
import { requireUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import type { ResolvedPermission } from "@/modules/permissions";

/**
 * 直播录制鉴权。
 *  - 浏览状态/浏览下载录像：scope !== "none"（默认全员）
 *  - 任务增删/暂停/改配置/删录像：can_edit（默认总监/老板，可在权限页单独授权）
 */
const MODULE = "recording" as const;

export async function requireRecordingViewer(): Promise<{
  userId: string;
  perm: ResolvedPermission;
}> {
  const { userId } = await requireUser();
  const perm = await resolvePermission(userId, MODULE);
  if (perm.scope === "none") throw new Error("无直播录制访问权限");
  return { userId, perm };
}

export async function requireRecordingWriter(): Promise<{
  userId: string;
  perm: ResolvedPermission;
}> {
  const { userId } = await requireUser();
  const perm = await resolvePermission(userId, MODULE);
  if (!perm.can_edit) throw new Error("无直播录制管理权限");
  return { userId, perm };
}
