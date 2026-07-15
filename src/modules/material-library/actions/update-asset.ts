"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { material_asset } from "@/db/schema/material";
import { requireMaterialPoint } from "../authz";
import { UpdateAssetInput } from "../schema";

/** 改素材元信息：名称 / 标签 / 归属目录。 */
export async function updateAsset(input: unknown): Promise<{ ok: true }> {
  const data = UpdateAssetInput.parse(input);
  await requireMaterialPoint("material_upload");

  const patch: Partial<typeof material_asset.$inferInsert> = { updated_at: new Date() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.tags !== undefined) patch.tags = data.tags;
  if (data.folderId !== undefined) patch.folder_id = data.folderId;

  const res = await db
    .update(material_asset)
    .set(patch)
    .where(and(eq(material_asset.id, data.id), isNull(material_asset.deleted_at)))
    .returning({ id: material_asset.id });
  if (!res.length) throw new Error("素材不存在或已删除");

  revalidatePath("/materials");
  return { ok: true };
}
