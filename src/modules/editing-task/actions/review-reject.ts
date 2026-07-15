"use server";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { writeEvent } from "../event-writer";
import { requireEditingPoint } from "../authz";
import { buildEditingScopeWhere } from "../scope";
import { assertTransition } from "../state-machine";
import { ReviewRejectInput } from "../schema";

export async function reviewReject(input: unknown): Promise<{ ok: true }> {
  const data = ReviewRejectInput.parse(input);
  const { userId, perm } = await requireEditingPoint("review");
  const scopeWhere = await buildEditingScopeWhere({ scope: perm.scope, userId });

  const [t] = await db
    .select({ status: editing_task.status })
    .from(editing_task)
    .where(and(eq(editing_task.id, data.taskId), isNull(editing_task.deleted_at), scopeWhere));
  if (!t) throw new Error("task not found");
  assertTransition(t.status, "editing");

  // UPDATE 带前状态守卫：防止与并发通过/上传 last-write-wins 互相覆盖
  await db.transaction(async (tx) => {
    const rows = await tx
      .update(editing_task)
      .set({
        status: "editing",
        ...(data.watchSeconds && data.watchSeconds > 0
          ? {
              review_watch_seconds: sql`${editing_task.review_watch_seconds} + ${data.watchSeconds}`,
            }
          : {}),
      })
      .where(and(eq(editing_task.id, data.taskId), eq(editing_task.status, t.status)))
      .returning({ id: editing_task.id });
    if (rows.length === 0) throw new Error("任务状态已变化，请刷新");

    // 注意：审核回退保留 editor_user_id（让原剪辑师继续改）
    await writeEvent(
      {
        taskId: data.taskId,
        eventType: "review_rejected",
        actorUserId: userId,
        payload: { reason: data.reason, watch_seconds: data.watchSeconds ?? 0 },
      },
      tx,
    );
  });
  return { ok: true };
}
