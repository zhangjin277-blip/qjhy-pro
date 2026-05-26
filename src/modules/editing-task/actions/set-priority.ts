"use server";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/page-auth";
import { writeEvent } from "../event-writer";
import { SetPriorityInput } from "../schema";

export async function setPriority(input: unknown): Promise<{ ok: true }> {
  const data = SetPriorityInput.parse(input);
  const { userId } = await requireUser();

  const [t] = await db
    .select({ priority: editing_task.priority, urgent_reason: editing_task.urgent_reason })
    .from(editing_task)
    .where(eq(editing_task.id, data.taskId));
  if (!t) throw new Error("task not found");

  await db
    .update(editing_task)
    .set({
      priority: data.priority,
      urgent_reason: data.priority === "urgent" ? (data.urgentReason ?? null) : null,
    })
    .where(eq(editing_task.id, data.taskId));

  await writeEvent({
    taskId: data.taskId,
    eventType: "priority_changed",
    actorUserId: userId,
    payload: {
      from: t.priority,
      to: data.priority,
      urgent_reason: data.priority === "urgent" ? (data.urgentReason ?? null) : null,
    },
  });

  return { ok: true };
}
