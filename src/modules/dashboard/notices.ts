import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { dingtalk_user, project_shared_state } from "@/db/schema";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { AppError } from "@/lib/errors";
import { resolvePermission } from "@/modules/permissions/server";
import {
  createProjectSharedState,
  getProjectSharedState,
  updateProjectSharedState,
} from "@/modules/project-shared-state/server";
import { noticeInputSchema, noticeSchema } from "./workbench-types";

// Reserved from the generic project shared-state API; all access goes through this module.
const PROJECT = "workbench";
async function actor() {
  const identity = await getCurrentDingtalkUser();
  if (identity.kind !== "ok") throw new AppError("AUTH_FORBIDDEN", "请先登录有效账号", 403);
  return identity;
}
async function canPublish(identity: Awaited<ReturnType<typeof actor>>) {
  if (identity.isEmergency) return true;
  const permission = await resolvePermission(identity.dingtalkUserId, "permissions");
  return permission.points.has("manage_roles") && permission.scope !== "none";
}
function readPrefix(userId: string) {
  return `read_${createHash("sha256").update(userId).digest("hex")}_`;
}
export async function getWorkbenchNotices() {
  const identity = await actor();
  const rows = await db
    .select()
    .from(project_shared_state)
    .where(
      and(
        eq(project_shared_state.project_key, PROJECT),
        like(project_shared_state.state_key, "notice_%"),
        sql`${project_shared_state.payload}->>'deletedAt' IS NULL`,
      ),
    )
    .orderBy(desc(project_shared_state.created_at))
    .limit(100);
  const notices = rows.flatMap((row) => {
    const parsed = noticeSchema.safeParse(row.payload);
    return parsed.success && !parsed.data.deletedAt ? [parsed.data] : [];
  });
  const prefix = readPrefix(identity.dingtalkUserId);
  const reads = await db
    .select({ key: project_shared_state.state_key })
    .from(project_shared_state)
    .where(
      and(
        eq(project_shared_state.project_key, PROJECT),
        like(project_shared_state.state_key, `${prefix}%`),
      ),
    );
  const readIds = new Set(reads.map((row) => row.key.slice(prefix.length)));
  return {
    items: notices
      .sort(
        (a, b) => Number(b.pinned) - Number(a.pinned) || b.publishedAt.localeCompare(a.publishedAt),
      )
      .map((notice) => ({ ...notice, read: readIds.has(notice.id) })),
    canPublish: await canPublish(identity),
  };
}
export async function publishWorkbenchNotice(raw: unknown) {
  const identity = await actor();
  if (!(await canPublish(identity)))
    throw new AppError("AUTH_FORBIDDEN", "需要岗位管理权限才能发布公告", 403);
  const parsed = noticeInputSchema.safeParse(raw);
  if (!parsed.success) throw new AppError("VALIDATION_ERROR", "请检查公告标题与正文", 400);
  const [user] = await db
    .select({ name: dingtalk_user.name })
    .from(dingtalk_user)
    .where(eq(dingtalk_user.user_id, identity.dingtalkUserId))
    .limit(1);
  const notice = {
    ...parsed.data,
    id: randomUUID(),
    publisher: user?.name || "管理员",
    publishedAt: new Date().toISOString(),
  };
  await createProjectSharedState(PROJECT, `notice_${notice.id}`, notice, identity.dingtalkUserId);
}
export async function deleteWorkbenchNotice(raw: unknown) {
  const identity = await actor();
  if (!(await canPublish(identity)))
    throw new AppError("AUTH_FORBIDDEN", "需要公告管理权限才能删除公告", 403);
  const parsed = z.uuid().safeParse(raw);
  if (!parsed.success) throw new AppError("VALIDATION_ERROR", "无效的公告标识", 400);
  const key = `notice_${parsed.data}`;
  const row = await getProjectSharedState(PROJECT, key);
  const notice = noticeSchema.safeParse(row?.payload);
  if (!row || !notice.success) throw new AppError("NOT_FOUND", "公告不存在", 404);
  if (notice.data.deletedAt) return;
  const updated = await updateProjectSharedState(
    PROJECT,
    key,
    { ...notice.data, deletedAt: new Date().toISOString(), deletedBy: identity.dingtalkUserId },
    row.revision,
    identity.dingtalkUserId,
  );
  if (!updated) throw new AppError("CONFLICT", "公告状态已更新，请刷新后重试", 409);
}
export async function markWorkbenchNoticesRead(raw: unknown) {
  const identity = await actor();
  const parsed = z.array(z.uuid()).max(100).safeParse(raw);
  if (!parsed.success) throw new AppError("VALIDATION_ERROR", "无效的公告标识", 400);
  // One immutable receipt per user/notice makes concurrent tabs idempotent without lost updates.
  for (const id of new Set(parsed.data)) {
    const notice = await getProjectSharedState(PROJECT, `notice_${id}`);
    const data = noticeSchema.safeParse(notice?.payload);
    if (!notice || !data.success || data.data.deletedAt) continue;
    await createProjectSharedState(
      PROJECT,
      `${readPrefix(identity.dingtalkUserId)}${id}`,
      { readAt: new Date().toISOString() },
      identity.dingtalkUserId,
    );
  }
}
