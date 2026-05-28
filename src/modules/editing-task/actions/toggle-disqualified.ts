"use server";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/page-auth";
import { writeEvent } from "../event-writer";
import { ToggleDisqualifiedInput } from "../schema";

export async function toggleDisqualified(input: unknown): Promise<{ ok: true }> {
  const data = ToggleDisqualifiedInput.parse(input);
  const { userId } = await requireUser();

  const [t] = await db
    .select({ status: editing_task.status, is_disqualified: editing_task.is_disqualified })
    .from(editing_task)
    .where(eq(editing_task.id, data.taskId));
  if (!t) throw new Error("task not found");

  if (data.disqualified) {
    await db
      .update(editing_task)
      .set({
        is_disqualified: true,
        disqualified_reason: data.reason ?? null,
        disqualified_by_user_id: userId,
        disqualified_at: new Date(),
      })
      .where(eq(editing_task.id, data.taskId));
    await writeEvent({
      taskId: data.taskId,
      eventType: "disqualified",
      actorUserId: userId,
      payload: { reason: data.reason ?? null },
    });
  } else {
    await db
      .update(editing_task)
      .set({
        is_disqualified: false,
        disqualified_reason: null,
        disqualified_by_user_id: null,
        disqualified_at: null,
      })
      .where(eq(editing_task.id, data.taskId));
    await writeEvent({
      taskId: data.taskId,
      eventType: "disqualified_undone",
      actorUserId: userId,
      payload: {},
    });
  }

  return { ok: true };
}
