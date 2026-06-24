"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { material_folder } from "@/db/schema/material";
import { requireMaterialWriter } from "../authz";
import { CreateFolderInput } from "../schema";

export async function createFolder(input: unknown): Promise<{ ok: true; id: number }> {
  const data = CreateFolderInput.parse(input);
  const { userId } = await requireMaterialWriter();
  const [row] = await db
    .insert(material_folder)
    .values({ name: data.name, parent_id: data.parentId, created_by_user_id: userId })
    .returning({ id: material_folder.id });
  if (!row) throw new Error("创建目录失败");
  revalidatePath("/materials");
  return { ok: true, id: row.id };
}
