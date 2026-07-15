"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { material_folder } from "@/db/schema/material";
import { requireMaterialPoint } from "../authz";

const Input = z.object({
  parentId: z.number().int().positive().nullable(),
  segments: z.array(z.string().min(1).max(60)).max(20),
});

/**
 * 按路径段在 parentId 下逐级 find-or-create 目录，返回最末级目录 id。
 * 文件夹上传时用：同名目录复用、不存在则建，保留原目录结构。
 */
export async function ensureFolderPath(
  input: unknown,
): Promise<{ ok: true; folderId: number | null }> {
  const { parentId, segments } = Input.parse(input);
  const { userId } = await requireMaterialPoint("material_organize");

  let parent: number | null = parentId;
  for (const name of segments) {
    const [existing] = await db
      .select({ id: material_folder.id })
      .from(material_folder)
      .where(
        and(
          eq(material_folder.name, name),
          parent == null
            ? isNull(material_folder.parent_id)
            : eq(material_folder.parent_id, parent),
          isNull(material_folder.deleted_at),
        ),
      );
    if (existing) {
      parent = existing.id;
      continue;
    }
    const [row] = await db
      .insert(material_folder)
      .values({ name, parent_id: parent, created_by_user_id: userId })
      .returning({ id: material_folder.id });
    if (!row) throw new Error("创建目录失败");
    parent = row.id;
  }

  revalidatePath("/materials");
  return { ok: true, folderId: parent };
}
