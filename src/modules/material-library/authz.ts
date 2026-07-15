import "server-only";
import { requireUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import type { ResolvedPermission } from "@/modules/permissions";

/**
 * 素材库鉴权。MVP 复用 editing_workflow 权限（剪辑师/admin 已有），
 * 后续再拆独立 material_library 权限。
 *
 *  - 浏览/下载：scope !== "none"
 *  - 上传/改标签/删除/建目录：can_edit
 */
const MODULE = "editing_workflow" as const;

export async function requireMaterialViewer(): Promise<{
  userId: string;
  perm: ResolvedPermission;
}> {
  const { userId } = await requireUser();
  const perm = await resolvePermission(userId, MODULE);
  if (perm.scope === "none") throw new Error("无素材库访问权限");
  return { userId, perm };
}

export async function requireMaterialPoint(point: string): Promise<{
  userId: string;
  perm: ResolvedPermission;
}> {
  const { userId } = await requireUser();
  const perm = await resolvePermission(userId, MODULE);
  if (!perm.points.has(point)) throw new Error("无素材库编辑权限");
  return { userId, perm };
}
