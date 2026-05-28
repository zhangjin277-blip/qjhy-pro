"use server";
import { db } from "@/db/client";
import { editing_task, live_account } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/page-auth";
import { writeEvent } from "../event-writer";
import { buildCoverPath, writeFile as nasWriteFile } from "@/modules/editing-storage/server";
import { z } from "zod";
import { unlink } from "node:fs/promises";
import { join } from "node:path";

const Input = z.object({
  taskId: z.number().int().positive(),
  fileName: z.string().min(1).max(255),
});

export async function uploadCover(formData: FormData): Promise<{ ok: true }> {
  const taskId = Number(formData.get("taskId"));
  const file = formData.get("file") as File | null;
  if (!file) throw new Error("missing file");
  if (file.size > 20 * 1024 * 1024) throw new Error("封面图不能超过 20MB");
  if (!file.type.startsWith("image/")) throw new Error("仅支持图片");

  const data = Input.parse({ taskId, fileName: file.name });
  const { userId } = await requireUser();

  const [task] = await db
    .select({
      id: editing_task.id,
      material_date: editing_task.material_date,
      cover_image: editing_task.cover_image,
      product: live_account.product,
    })
    .from(editing_task)
    .leftJoin(live_account, eq(live_account.id, editing_task.live_account_id))
    .where(eq(editing_task.id, data.taskId));

  if (!task) throw new Error("task not found");

  const NAS = process.env.EDITING_NAS_PATH;
  if (!NAS) throw new Error("EDITING_NAS_PATH not configured");

  // 删旧封面
  if (task.cover_image) {
    try {
      await unlink(join(NAS, task.cover_image));
    } catch {
      // 忽略文件不存在等错误
    }
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const relPath = buildCoverPath({
    taskId: task.id,
    product: task.product ?? "未分类",
    materialDate: task.material_date.toISOString().slice(0, 10),
    originalName: data.fileName,
  });
  await nasWriteFile(NAS, relPath, buf);

  await db.update(editing_task).set({ cover_image: relPath }).where(eq(editing_task.id, task.id));

  await writeEvent({
    taskId: task.id,
    eventType: "cover_uploaded",
    actorUserId: userId,
    payload: { file_name: data.fileName },
  });

  return { ok: true };
}
