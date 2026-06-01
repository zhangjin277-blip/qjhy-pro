"use server";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { requireUser } from "@/lib/auth/page-auth";
import { writeEvent } from "../event-writer";
import { CreateTaskInput } from "../schema";
import { notifyUrgentTaskCreated } from "../notify";

export interface CreateTaskResult {
  taskId: number;
}

// 注：任务级（账号+日期+主播）判重已移除——同一主播一天可建多个任务（多条素材）。
// 真正的去重靠上传源文件时的 MD5 文件内容判重（upload-source.ts）。
export async function createTask(input: unknown): Promise<CreateTaskResult> {
  const data = CreateTaskInput.parse(input);
  const { userId } = await requireUser();

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

  // 紧急任务：fire-and-forget 钉钉通知，不阻塞主流程
  if (data.priority === "urgent") {
    notifyUrgentTaskCreated(row.id, data.urgentReason ?? null).catch((e: unknown) => void e);
  }

  return { taskId: row.id };
}
