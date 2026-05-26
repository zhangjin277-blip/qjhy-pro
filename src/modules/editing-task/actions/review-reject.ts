"use server";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/page-auth";
import { writeEvent } from "../event-writer";
import { assertTransition } from "../state-machine";
import { ReviewRejectInput } from "../schema";

export async function reviewReject(input: unknown): Promise<{ ok: true }> {
  const data = ReviewRejectInput.parse(input);
  const { userId } = await requireUser();
  const [t] = await db
    .select({ status: editing_task.status })
    .from(editing_task)
    .where(eq(editing_task.id, data.taskId));
  if (!t) throw new Error("task not found");
  assertTransition(t.status, "editing");

  await db.update(editing_task).set({ status: "editing" }).where(eq(editing_task.id, data.taskId));
  // 注意：审核回退保留 editor_user_id（让原剪辑师继续改）
  await writeEvent({
    taskId: data.taskId,
    eventType: "review_rejected",
    actorUserId: userId,
    payload: { reason: data.reason },
  });
  return { ok: true };
}
