"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { material_folder, material_asset } from "@/db/schema/material";
import { requireMaterialWriter } from "../authz";
import { DeleteFolderInput } from "../schema";

/** 删除目录：仅允许删空目录（无子目录、无素材），避免级联误删。 */
export async function deleteFolder(input: unknown): Promise<{ ok: true }> {
  const data = DeleteFolderInput.parse(input);
  await requireMaterialWriter();

  const [child] = await db
    .select({ id: material_folder.id })
    .from(material_folder)
    .where(and(eq(material_folder.parent_id, data.id), isNull(material_folder.deleted_at)))
    .limit(1);
  if (child) throw new Error("该目录下还有子目录，请先删除子目录");

  const [asset] = await db
    .select({ id: material_asset.id })
    .from(material_asset)
    .where(and(eq(material_asset.folder_id, data.id), isNull(material_asset.deleted_at)))
    .limit(1);
  if (asset) throw new Error("该目录下还有素材，请先移走或删除素材");

  const res = await db
    .update(material_folder)
    .set({ deleted_at: new Date() })
    .where(and(eq(material_folder.id, data.id), isNull(material_folder.deleted_at)))
    .returning({ id: material_folder.id });
  if (!res.length) throw new Error("目录不存在");

  revalidatePath("/materials");
  return { ok: true };
}
