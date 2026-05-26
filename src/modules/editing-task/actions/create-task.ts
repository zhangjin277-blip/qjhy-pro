"use server";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { requireUser } from "@/lib/auth/page-auth";
import { writeEvent } from "../event-writer";
import { CreateTaskInput } from "../schema";

export async function createTask(input: unknown): Promise<{ taskId: number }> {
  const data = CreateTaskInput.parse(input);
  const { userId } = await requireUser();

  const rows = await db
    .insert(editing_task)
    .values({
      live_account_id: data.liveAccountId,
      anchor_id: data.anchorId ?? null,
      material_date: new Date(data.materialDate),
      status: "uploaded",
      source_remark: data.sourceRemark ?? null,
      created_by_user_id: userId,
    })
    .returning({ id: editing_task.id });

  const row = rows[0];
  if (!row) throw new Error("insert editing_task failed");

  await writeEvent({
    taskId: row.id,
    eventType: "created",
    actorUserId: userId,
    payload: {
      live_account_id: data.liveAccountId,
      anchor_id: data.anchorId ?? null,
      material_date: data.materialDate,
      source_remark: data.sourceRemark ?? null,
    },
  });

  return { taskId: row.id };
}
