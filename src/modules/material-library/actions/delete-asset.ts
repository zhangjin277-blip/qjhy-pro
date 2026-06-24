"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { material_asset } from "@/db/schema/material";
import { removeFile } from "@/modules/editing-storage/server";
import { requireMaterialWriter } from "../authz";
import { DeleteAssetInput } from "../schema";

/**
 * 删除素材：软删 DB 行 + 删 NAS 物理文件。
 * 去重保证 nas_path 与 asset 一一对应（命中去重不新建行），故删文件安全。
 */
export async function deleteAsset(input: unknown): Promise<{ ok: true }> {
  const data = DeleteAssetInput.parse(input);
  await requireMaterialWriter();

  const [row] = await db
    .select({ id: material_asset.id, nasPath: material_asset.nas_path })
    .from(material_asset)
    .where(and(eq(material_asset.id, data.id), isNull(material_asset.deleted_at)));
  if (!row) throw new Error("素材不存在或已删除");

  await db
    .update(material_asset)
    .set({ deleted_at: new Date() })
    .where(eq(material_asset.id, data.id));

  const NAS = process.env.EDITING_NAS_PATH;
  if (NAS) await removeFile(NAS, row.nasPath).catch(() => undefined);

  revalidatePath("/materials");
  return { ok: true };
}
