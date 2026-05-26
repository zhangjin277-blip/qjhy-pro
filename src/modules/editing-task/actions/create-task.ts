"use server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { requireUser } from "@/lib/auth/page-auth";
import { writeEvent } from "../event-writer";
import { CreateTaskInput } from "../schema";

export type CreateTaskResult =
  | { taskId: number }
  | {
      ok: false;
      reason: "duplicate";
      existing: { id: number; status: string; createdAt: string }[];
    };

export async function createTask(input: unknown): Promise<CreateTaskResult> {
  const data = CreateTaskInput.parse(input);
  const { userId } = await requireUser();

  if (!data.force) {
    const existing = await db
      .select({
        id: editing_task.id,
        status: editing_task.status,
        created_at: editing_task.created_at,
      })
      .from(editing_task)
      .where(
        and(
          eq(editing_task.live_account_id, data.liveAccountId),
          eq(editing_task.material_date, new Date(data.materialDate)),
          data.anchorId
            ? eq(editing_task.anchor_id, data.anchorId)
            : isNull(editing_task.anchor_id),
        ),
      );

    if (existing.length > 0) {
      return {
        ok: false,
        reason: "duplicate",
        existing: existing.map((e) => ({
          id: e.id,
          status: e.status,
          createdAt: e.created_at.toISOString(),
        })),
      };
    }
  }

  const rows = await db
    .insert(editing_task)
    .values({
      live_account_id: data.liveAccountId,
      anchor_id: data.anchorId ?? null,
      material_date: new Date(data.materialDate),
      status: "uploaded",
      source_remark: data.sourceRemark ?? null,
      created_by_user_id: userId,
      priority: data.priority ?? "normal",
      urgent_reason: data.priority === "urgent" ? (data.urgentReason ?? null) : null,
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
      priority: data.priority ?? "normal",
      urgent_reason: data.priority === "urgent" ? (data.urgentReason ?? null) : null,
    },
  });

  return { taskId: row.id };
}
