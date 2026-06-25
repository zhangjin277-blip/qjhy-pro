"use server";
import { revalidatePath } from "next/cache";
import { and, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { material_asset } from "@/db/schema/material";
import { requireMaterialWriter } from "../authz";
import { BatchMoveInput } from "../schema";

/** 批量移动素材到指定目录（folderId=null → 未分类）。 */
export async function batchMoveAssets(input: unknown): Promise<{ ok: true; moved: number }> {
  const data = BatchMoveInput.parse(input);
  await requireMaterialWriter();
  const res = await db
    .update(material_asset)
    .set({ folder_id: data.folderId, updated_at: new Date() })
    .where(and(inArray(material_asset.id, data.ids), isNull(material_asset.deleted_at)))
    .returning({ id: material_asset.id });
  revalidatePath("/materials");
  return { ok: true, moved: res.length };
}
