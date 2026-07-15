"use server";
import { revalidatePath } from "next/cache";
import { and, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { material_asset } from "@/db/schema/material";
import { removeFile } from "@/modules/editing-storage/server";
import { requireMaterialPoint } from "../authz";
import { BatchDeleteInput } from "../schema";

/** 批量删除素材：软删 DB 行 + 删 NAS 物理文件。 */
export async function batchDeleteAssets(input: unknown): Promise<{ ok: true; deleted: number }> {
  const data = BatchDeleteInput.parse(input);
  await requireMaterialPoint("material_delete");

  const rows = await db
    .select({ id: material_asset.id, nasPath: material_asset.nas_path })
    .from(material_asset)
    .where(and(inArray(material_asset.id, data.ids), isNull(material_asset.deleted_at)));
  if (!rows.length) return { ok: true, deleted: 0 };

  const ids = rows.map((r) => r.id);
  await db
    .update(material_asset)
    .set({ deleted_at: new Date() })
    .where(inArray(material_asset.id, ids));

  const NAS = process.env.EDITING_NAS_PATH;
  if (NAS) {
    for (const r of rows) await removeFile(NAS, r.nasPath).catch(() => undefined);
  }

  revalidatePath("/materials");
  return { ok: true, deleted: rows.length };
}
