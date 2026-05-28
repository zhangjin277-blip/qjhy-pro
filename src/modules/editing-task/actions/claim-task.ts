"use server";
import { db } from "@/db/client";
import { editing_task, dingtalk_user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/page-auth";
import { writeEvent } from "../event-writer";
import { assertTransition } from "../state-machine";
import { z } from "zod";

const Input = z.object({ taskId: z.number().int().positive() });

export async function claimTask(input: unknown): Promise<{ ok: true }> {
  const { taskId } = Input.parse(input);
  const { userId } = await requireUser();

  const [t] = await db
    .select({ status: editing_task.status })
    .from(editing_task)
    .where(eq(editing_task.id, taskId));
  if (!t) throw new Error("task not found");
  assertTransition(t.status, "editing");

  const [me] = await db
    .select({ name: dingtalk_user.name })
    .from(dingtalk_user)
    .where(eq(dingtalk_user.user_id, userId));

  await db
    .update(editing_task)
    .set({
      editor_user_id: userId,
      editing_started_at: new Date(),
      status: "editing",
    })
    .where(eq(editing_task.id, taskId));

  await writeEvent({
    taskId,
    eventType: "assigned",
    actorUserId: userId,
    payload: {
      from: "unassigned",
      to: userId,
      to_name: me?.name ?? userId,
      self_claimed: true,
    },
  });

  return { ok: true };
}
