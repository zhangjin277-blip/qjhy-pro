"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { material_folder } from "@/db/schema/material";
import { requireMaterialWriter } from "../authz";
import { RenameFolderInput } from "../schema";

export async function renameFolder(input: unknown): Promise<{ ok: true }> {
  const data = RenameFolderInput.parse(input);
  await requireMaterialWriter();
  const res = await db
    .update(material_folder)
    .set({ name: data.name, updated_at: new Date() })
    .where(and(eq(material_folder.id, data.id), isNull(material_folder.deleted_at)))
    .returning({ id: material_folder.id });
  if (!res.length) throw new Error("目录不存在");
  revalidatePath("/materials");
  return { ok: true };
}
