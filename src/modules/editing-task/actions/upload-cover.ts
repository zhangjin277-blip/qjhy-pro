"use server";
import { db } from "@/db/client";
import { editing_task, live_account } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { writeEvent } from "../event-writer";
import { requireEditingPoint } from "../authz";
import { buildEditingScopeWhere } from "../scope";
import {
  buildCoverPath,
  removeFile as nasRemoveFile,
  writeFile as nasWriteFile,
} from "@/modules/editing-storage/server";
import { z } from "zod";

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
  const { userId, perm } = await requireEditingPoint("cover_manage");
  const scopeWhere = await buildEditingScopeWhere({ scope: perm.scope, userId });

  const [task] = await db
    .select({
      id: editing_task.id,
      material_date: editing_task.material_date,
      cover_image: editing_task.cover_image,
      product: live_account.product,
    })
    .from(editing_task)
    .leftJoin(live_account, eq(live_account.id, editing_task.live_account_id))
    .where(and(eq(editing_task.id, data.taskId), isNull(editing_task.deleted_at), scopeWhere));

  if (!task) throw new Error("task not found");

  const NAS = process.env.EDITING_NAS_PATH;
  if (!NAS) throw new Error("EDITING_NAS_PATH not configured");

  const buf = Buffer.from(await file.arrayBuffer());
  const relPath = buildCoverPath({
    taskId: task.id,
    product: task.product ?? "未分类",
    materialDate: task.material_date.toISOString().slice(0, 10),
    originalName: data.fileName,
  });

  // 顺序：先写新文件 → 更新 DB → 最后删旧封面。
  // 旧顺序（先删旧再写新）在写入失败时旧封面已删且 DB 指向不存在的路径，不可恢复
  await nasWriteFile(NAS, relPath, buf);

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(editing_task)
        .set({ cover_image: relPath })
        .where(eq(editing_task.id, task.id));
      await writeEvent(
        {
          taskId: task.id,
          eventType: "cover_uploaded",
          actorUserId: userId,
          payload: { file_name: data.fileName },
        },
        tx,
      );
    });
  } catch (err) {
    // DB 写失败补偿：同名覆盖（relPath === 旧路径）时不能删 —— DB 仍指向该路径
    if (task.cover_image !== relPath) await nasRemoveFile(NAS, relPath).catch(() => undefined);
    throw err;
  }

  // 删旧封面（同名覆盖时新旧同路径，跳过）
  if (task.cover_image && task.cover_image !== relPath) {
    await nasRemoveFile(NAS, task.cover_image).catch(() => undefined);
  }

  return { ok: true };
}
