"use server";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { writeEvent } from "../event-writer";
import { requireEditingPoint } from "../authz";
import { buildEditingScopeWhere } from "../scope";
import { SetPriorityInput } from "../schema";

export async function setPriority(input: unknown): Promise<{ ok: true }> {
  const data = SetPriorityInput.parse(input);
  const { userId, perm } = await requireEditingPoint("task_manage");
  const scopeWhere = await buildEditingScopeWhere({ scope: perm.scope, userId });

  const [t] = await db
    .select({ priority: editing_task.priority, urgent_reason: editing_task.urgent_reason })
    .from(editing_task)
    .where(and(eq(editing_task.id, data.taskId), isNull(editing_task.deleted_at), scopeWhere));
  if (!t) throw new Error("task not found");

  await db.transaction(async (tx) => {
    await tx
      .update(editing_task)
      .set({
        priority: data.priority,
        urgent_reason: data.priority === "urgent" ? (data.urgentReason ?? null) : null,
      })
      .where(eq(editing_task.id, data.taskId));

    await writeEvent(
      {
        taskId: data.taskId,
        eventType: "priority_changed",
        actorUserId: userId,
        payload: {
          from: t.priority,
          to: data.priority,
          urgent_reason: data.priority === "urgent" ? (data.urgentReason ?? null) : null,
        },
      },
      tx,
    );
  });

  return { ok: true };
}
