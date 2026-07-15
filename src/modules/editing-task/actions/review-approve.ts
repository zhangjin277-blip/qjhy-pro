"use server";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { writeEvent } from "../event-writer";
import { requireEditingPoint } from "../authz";
import { buildEditingScopeWhere } from "../scope";
import { assertTransition } from "../state-machine";
import { z } from "zod";

const Input = z.object({
  taskId: z.number().int().positive(),
  watchSeconds: z.number().int().nonnegative().optional(),
});

export async function reviewApprove(input: unknown): Promise<{ ok: true }> {
  const { taskId, watchSeconds } = Input.parse(input);
  const { userId, perm } = await requireEditingPoint("review");
  const scopeWhere = await buildEditingScopeWhere({ scope: perm.scope, userId });

  const [t] = await db
    .select({ status: editing_task.status })
    .from(editing_task)
    .where(and(eq(editing_task.id, taskId), isNull(editing_task.deleted_at), scopeWhere));
  if (!t) throw new Error("task not found");
  assertTransition(t.status, "ready");

  // UPDATE 带前状态守卫：防止与并发驳回/重置 last-write-wins 互相覆盖
  await db.transaction(async (tx) => {
    const rows = await tx
      .update(editing_task)
      .set({
        status: "ready",
        reviewed_by_user_id: userId,
        reviewed_at: new Date(),
        ...(watchSeconds && watchSeconds > 0
          ? { review_watch_seconds: sql`${editing_task.review_watch_seconds} + ${watchSeconds}` }
          : {}),
      })
      .where(and(eq(editing_task.id, taskId), eq(editing_task.status, t.status)))
      .returning({ id: editing_task.id });
    if (rows.length === 0) throw new Error("任务状态已变化，请刷新");

    await writeEvent(
      {
        taskId,
        eventType: "review_approved",
        actorUserId: userId,
        payload: { watch_seconds: watchSeconds ?? 0 },
      },
      tx,
    );
  });
  return { ok: true };
}
