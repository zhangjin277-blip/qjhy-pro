"use server";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { writeEvent } from "../event-writer";
import { requireEditingPoint } from "../authz";
import { buildEditingScopeWhere } from "../scope";
import { assertTransition } from "../state-machine";
import { z } from "zod";

const Input = z.object({ taskId: z.number().int().positive() });

export async function resetEditing(input: unknown): Promise<{ ok: true }> {
  const { taskId } = Input.parse(input);
  const { userId, perm } = await requireEditingPoint("task_manage");
  const scopeWhere = await buildEditingScopeWhere({ scope: perm.scope, userId });

  const [t] = await db
    .select({
      status: editing_task.status,
      prev_editor: editing_task.editor_user_id,
    })
    .from(editing_task)
    .where(and(eq(editing_task.id, taskId), isNull(editing_task.deleted_at), scopeWhere));
  if (!t) throw new Error("task not found");
  assertTransition(t.status, "uploaded");

  // UPDATE 带前状态守卫：防止与并发上传成品（editing → review）互相覆盖
  await db.transaction(async (tx) => {
    const rows = await tx
      .update(editing_task)
      .set({
        status: "uploaded",
        editor_user_id: null,
        editing_started_at: null,
      })
      .where(and(eq(editing_task.id, taskId), eq(editing_task.status, t.status)))
      .returning({ id: editing_task.id });
    if (rows.length === 0) throw new Error("任务状态已变化，请刷新");

    await writeEvent(
      {
        taskId,
        eventType: "editing_reset",
        actorUserId: userId,
        payload: { prev_editor: t.prev_editor },
      },
      tx,
    );
  });
  return { ok: true };
}
