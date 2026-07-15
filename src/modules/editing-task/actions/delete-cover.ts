"use server";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import { writeEvent } from "../event-writer";
import { z } from "zod";
import { unlink } from "node:fs/promises";
import { join } from "node:path";

const Input = z.object({ taskId: z.number().int().positive() });

export async function deleteCover(input: unknown): Promise<{ ok: true }> {
  const { taskId } = Input.parse(input);
  const { userId } = await requireUser();

  const [t] = await db
    .select({
      cover_image: editing_task.cover_image,
      editor_user_id: editing_task.editor_user_id,
    })
    .from(editing_task)
    .where(eq(editing_task.id, taskId));

  if (!t) throw new Error("task not found");
  if (!t.cover_image) return { ok: true };

  // 权限：封面管理点 或 任务剪辑师本人
  const perm = await resolvePermission(userId, "editing_workflow");
  if (!perm.points.has("cover_manage") && t.editor_user_id !== userId) {
    throw new Error("仅有封面管理权限或任务剪辑师可删封面图");
  }

  const NAS = process.env.EDITING_NAS_PATH;
  if (NAS) {
    try {
      await unlink(join(NAS, t.cover_image));
    } catch {
      // 忽略文件不存在等错误
    }
  }

  await db.update(editing_task).set({ cover_image: null }).where(eq(editing_task.id, taskId));

  await writeEvent({
    taskId,
    eventType: "cover_deleted",
    actorUserId: userId,
    payload: {},
  });

  return { ok: true };
}
