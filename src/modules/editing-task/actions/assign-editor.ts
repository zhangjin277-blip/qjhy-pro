"use server";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireUser } from "@/lib/auth/page-auth";
import { writeEvent } from "../event-writer";
import { AssignEditorInput } from "../schema";
import { assertTransition } from "../state-machine";

export async function assignEditor(input: unknown): Promise<{ updated: number; skipped: number }> {
  const data = AssignEditorInput.parse(input);
  const { userId } = await requireUser();

  const tasks = await db
    .select({
      id: editing_task.id,
      status: editing_task.status,
      prev_editor: editing_task.editor_user_id,
    })
    .from(editing_task)
    .where(inArray(editing_task.id, data.taskIds));

  let updated = 0;
  let skipped = 0;

  for (const t of tasks) {
    if (t.status === "uploaded") {
      // 派单：uploaded → editing
      assertTransition("uploaded", "editing");
      await db
        .update(editing_task)
        .set({
          editor_user_id: data.editorUserId,
          editing_started_at: new Date(),
          status: "editing",
        })
        .where(eq(editing_task.id, t.id));

      await writeEvent({
        taskId: t.id,
        eventType: "assigned",
        actorUserId: userId,
        payload: { from: "unassigned", to: data.editorUserId },
      });
      updated++;
    } else if (t.status === "editing") {
      // 改派：editing 状态保持，只换 editor
      await db
        .update(editing_task)
        .set({
          editor_user_id: data.editorUserId,
        })
        .where(eq(editing_task.id, t.id));

      await writeEvent({
        taskId: t.id,
        eventType: "reassigned",
        actorUserId: userId,
        payload: { from: t.prev_editor, to: data.editorUserId },
      });
      updated++;
    } else {
      skipped++;
    }
  }

  return { updated, skipped };
}
