"use server";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireUser } from "@/lib/auth/page-auth";
import { DeleteTaskInput } from "../schema";
import { resolvePermission } from "@/modules/permissions/server";
import { writeAuditLog } from "@/lib/audit";
import { writeEvent } from "../event-writer";

export async function deleteTask(input: unknown): Promise<{ deleted: number; skipped: number }> {
  const data = DeleteTaskInput.parse(input);
  const { userId } = await requireUser();
  const perm = await resolvePermission(userId, "editing_workflow");
  const isAdmin = perm.points.has("task_delete");

  const candidates = await db
    .select({
      id: editing_task.id,
      status: editing_task.status,
      created_by: editing_task.created_by_user_id,
      deleted_at: editing_task.deleted_at,
    })
    .from(editing_task)
    .where(inArray(editing_task.id, data.taskIds));

  const allowed = candidates.filter(
    (t) =>
      t.deleted_at === null && // 排除已软删的
      t.status !== "published" &&
      (isAdmin || t.created_by === userId),
  );
  const skipped = candidates.length - allowed.length;

  for (const t of allowed) {
    await writeAuditLog({
      user_id: userId,
      action: "editing_task.delete",
      target_type: "editing_task",
      target_id: String(t.id),
      before: { last_status: t.status },
      after: { deleted_at: new Date().toISOString() },
    });

    await db
      .update(editing_task)
      .set({
        deleted_at: new Date(),
        deleted_by_user_id: userId,
      })
      .where(eq(editing_task.id, t.id));

    await writeEvent({
      taskId: t.id,
      eventType: "deleted",
      actorUserId: userId,
      payload: { last_status: t.status },
    });
  }

  return { deleted: allowed.length, skipped };
}
