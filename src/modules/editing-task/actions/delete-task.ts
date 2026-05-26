"use server";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireUser } from "@/lib/auth/page-auth";
import { DeleteTaskInput } from "../schema";
import { resolvePermission } from "@/modules/permissions/server";
import { writeAuditLog } from "@/lib/audit";

export async function deleteTask(input: unknown): Promise<{ deleted: number; skipped: number }> {
  const data = DeleteTaskInput.parse(input);
  const { userId } = await requireUser();
  const perm = await resolvePermission(userId, "editing_workflow");
  const isAdmin = perm.can_admin;

  const candidates = await db
    .select({
      id: editing_task.id,
      status: editing_task.status,
      created_by: editing_task.created_by_user_id,
    })
    .from(editing_task)
    .where(inArray(editing_task.id, data.taskIds));

  const allowed = candidates.filter(
    (t) => t.status !== "published" && (isAdmin || t.created_by === userId),
  );
  const skipped = candidates.length - allowed.length;

  for (const t of allowed) {
    await writeAuditLog({
      user_id: userId,
      action: "editing_task.delete",
      target_type: "editing_task",
      target_id: String(t.id),
      before: { last_status: t.status },
    });
    await db.delete(editing_task).where(eq(editing_task.id, t.id));
  }

  return { deleted: allowed.length, skipped };
}
