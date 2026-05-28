"use server";
import { db } from "@/db/client";
import { editing_task, dingtalk_user } from "@/db/schema";
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

  // 查新剪辑师 + 旧剪辑师的名字（便于写到 event payload）
  const involvedIds = new Set<string>([data.editorUserId]);
  for (const t of tasks) if (t.prev_editor) involvedIds.add(t.prev_editor);
  const users = await db
    .select({ user_id: dingtalk_user.user_id, name: dingtalk_user.name })
    .from(dingtalk_user)
    .where(inArray(dingtalk_user.user_id, Array.from(involvedIds)));
  const nameMap = new Map(users.map((u) => [u.user_id, u.name]));
  const toName = nameMap.get(data.editorUserId) ?? data.editorUserId;

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
        payload: { from: "unassigned", to: data.editorUserId, to_name: toName },
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
        payload: {
          from: t.prev_editor,
          from_name: t.prev_editor ? (nameMap.get(t.prev_editor) ?? t.prev_editor) : null,
          to: data.editorUserId,
          to_name: toName,
        },
      });
      updated++;
    } else {
      skipped++;
    }
  }

  return { updated, skipped };
}
