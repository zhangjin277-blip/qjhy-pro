import "server-only";
import { requireUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import type { ResolvedPermission } from "@/modules/permissions";

/**
 * 软件库鉴权。
 *  - 浏览/下载：scope !== "none"（默认全员）
 *  - 上传/编辑/删除/分类管理：can_edit（默认总监/老板，可在权限页单独授权）
 */
const MODULE = "software_library" as const;

export async function requireSoftwareViewer(): Promise<{
  userId: string;
  perm: ResolvedPermission;
}> {
  const { userId } = await requireUser();
  const perm = await resolvePermission(userId, MODULE);
  if (perm.scope === "none") throw new Error("无软件库访问权限");
  return { userId, perm };
}

export async function requireSoftwarePoint(point: string): Promise<{
  userId: string;
  perm: ResolvedPermission;
}> {
  const { userId } = await requireUser();
  const perm = await resolvePermission(userId, MODULE);
  if (!perm.points.has(point)) throw new Error("无软件库上传/管理权限");
  return { userId, perm };
}
