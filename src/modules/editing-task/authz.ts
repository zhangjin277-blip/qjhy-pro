import "server-only";
import { requireUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import type { ResolvedPermission } from "@/modules/permissions";

/**
 * 剪辑工作流写操作统一鉴权：登录 + editing_workflow.can_edit。
 *
 * 各 action 拿到 perm 后还须用 buildEditingScopeWhere({ scope: perm.scope, userId })
 * 把目标 task 的查询限制在自己的数据可见范围内（scope 外的任务按 not found 处理，
 * 防止越权操作 / IDOR 探测任务存在性）。
 */
export async function requireEditingWriter(): Promise<{
  userId: string;
  perm: ResolvedPermission;
}> {
  const { userId } = await requireUser();
  const perm = await resolvePermission(userId, "editing_workflow");
  if (!perm.can_edit) throw new Error("无剪辑工作流编辑权限");
  return { userId, perm };
}
