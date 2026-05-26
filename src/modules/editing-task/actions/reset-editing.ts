"use server";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/page-auth";
import { writeEvent } from "../event-writer";
import { assertTransition } from "../state-machine";
import { z } from "zod";

const Input = z.object({ taskId: z.number().int().positive() });

export async function resetEditing(input: unknown): Promise<{ ok: true }> {
  const { taskId } = Input.parse(input);
  const { userId } = await requireUser();
  const [t] = await db
    .select({
      status: editing_task.status,
      prev_editor: editing_task.editor_user_id,
    })
    .from(editing_task)
    .where(eq(editing_task.id, taskId));
  if (!t) throw new Error("task not found");
  assertTransition(t.status, "uploaded");

  await db
    .update(editing_task)
    .set({
      status: "uploaded",
      editor_user_id: null,
      editing_started_at: null,
    })
    .where(eq(editing_task.id, taskId));

  await writeEvent({
    taskId,
    eventType: "editing_reset",
    actorUserId: userId,
    payload: { prev_editor: t.prev_editor },
  });
  return { ok: true };
}
