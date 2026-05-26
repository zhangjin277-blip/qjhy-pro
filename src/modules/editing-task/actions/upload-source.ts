"use server";
import { db } from "@/db/client";
import { editing_task, live_account } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/page-auth";
import { writeEvent } from "../event-writer";
import { buildSourcePath, writeFile as nasWriteFile } from "@/modules/editing-storage/server";
import { UploadSourceInput } from "../schema";

export async function uploadSource(formData: FormData): Promise<{ ok: true }> {
  const taskId = Number(formData.get("taskId"));
  const file = formData.get("file") as File | null;
  if (!file) throw new Error("missing file");
  const data = UploadSourceInput.parse({ taskId, fileName: file.name });
  const { userId } = await requireUser();

  const [task] = await db
    .select({
      id: editing_task.id,
      material_date: editing_task.material_date,
      live_account_id: editing_task.live_account_id,
      status: editing_task.status,
      product: live_account.product,
      source_files: editing_task.source_files,
      source_file_names: editing_task.source_file_names,
    })
    .from(editing_task)
    .leftJoin(live_account, eq(live_account.id, editing_task.live_account_id))
    .where(eq(editing_task.id, data.taskId));

  if (!task) throw new Error("task not found");
  if (task.status !== "uploaded") throw new Error("仅 uploaded 状态可上传素材");

  const NAS = process.env.EDITING_NAS_PATH;
  if (!NAS) throw new Error("EDITING_NAS_PATH not configured");

  const buf = Buffer.from(await file.arrayBuffer());
  const materialDateStr = task.material_date.toISOString().slice(0, 10);
  const relPath = buildSourcePath({
    taskId: task.id,
    product: task.product ?? "未分类",
    materialDate: materialDateStr,
    originalName: data.fileName,
  });
  await nasWriteFile(NAS, relPath, buf);

  await db
    .update(editing_task)
    .set({
      source_files: [...(task.source_files ?? []), relPath],
      source_file_names: [...(task.source_file_names ?? []), data.fileName],
      source_uploaded_at: new Date(),
    })
    .where(eq(editing_task.id, task.id));

  await writeEvent({
    taskId: task.id,
    eventType: "source_uploaded",
    actorUserId: userId,
    payload: { file_count: 1, file_names: [data.fileName] },
  });

  return { ok: true };
}
