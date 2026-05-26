"use server";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireUser } from "@/lib/auth/page-auth";
import { writeEvent } from "../event-writer";
import { assertTransition } from "../state-machine";
import { z } from "zod";

const Input = z.object({
  taskId: z.number().int().positive(),
  watchSeconds: z.number().int().nonnegative().optional(),
});

export async function reviewApprove(input: unknown): Promise<{ ok: true }> {
  const { taskId, watchSeconds } = Input.parse(input);
  const { userId } = await requireUser();
  const [t] = await db
    .select({ status: editing_task.status })
    .from(editing_task)
    .where(eq(editing_task.id, taskId));
  if (!t) throw new Error("task not found");
  assertTransition(t.status, "ready");

  await db
    .update(editing_task)
    .set({
      status: "ready",
      reviewed_by_user_id: userId,
      reviewed_at: new Date(),
      ...(watchSeconds && watchSeconds > 0
        ? { review_watch_seconds: sql`${editing_task.review_watch_seconds} + ${watchSeconds}` }
        : {}),
    })
    .where(eq(editing_task.id, taskId));

  await writeEvent({
    taskId,
    eventType: "review_approved",
    actorUserId: userId,
    payload: { watch_seconds: watchSeconds ?? 0 },
  });
  return { ok: true };
}
