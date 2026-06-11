"use server";
import { db } from "@/db/client";
import { editing_task, dingtalk_user } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { writeEvent } from "../event-writer";
import { requireEditingWriter } from "../authz";
import { buildEditingScopeWhere } from "../scope";
import { assertTransition } from "../state-machine";
import { z } from "zod";

const Input = z.object({ taskId: z.number().int().positive() });

export async function claimTask(input: unknown): Promise<{ ok: true }> {
  const { taskId } = Input.parse(input);
  const { userId, perm } = await requireEditingWriter();
  const scopeWhere = await buildEditingScopeWhere({ scope: perm.scope, userId });

  const [t] = await db
    .select({ status: editing_task.status })
    .from(editing_task)
    .where(and(eq(editing_task.id, taskId), isNull(editing_task.deleted_at), scopeWhere));
  if (!t) throw new Error("task not found");
  assertTransition(t.status, "editing");

  const [me] = await db
    .select({ name: dingtalk_user.name })
    .from(dingtalk_user)
    .where(eq(dingtalk_user.user_id, userId));

  // UPDATE 带前状态守卫：两人同时抢单只有一个能改到行，另一个报已变化（防静默覆盖丢单）
  await db.transaction(async (tx) => {
    const rows = await tx
      .update(editing_task)
      .set({
        editor_user_id: userId,
        editing_started_at: new Date(),
        status: "editing",
      })
      .where(and(eq(editing_task.id, taskId), eq(editing_task.status, t.status)))
      .returning({ id: editing_task.id });
    if (rows.length === 0) throw new Error("任务状态已变化，请刷新");

    await writeEvent(
      {
        taskId,
        eventType: "assigned",
        actorUserId: userId,
        payload: {
          from: "unassigned",
          to: userId,
          to_name: me?.name ?? userId,
          self_claimed: true,
        },
      },
      tx,
    );
  });

  return { ok: true };
}
