"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { software_category } from "@/db/schema/software";
import { requireSoftwarePoint } from "../authz";
import { categoryNameTaken } from "../queries";
import { RenameCategoryInput } from "../schema";

export async function renameCategory(input: unknown): Promise<{ ok: true }> {
  const data = RenameCategoryInput.parse(input);
  await requireSoftwarePoint("item_edit");
  if (await categoryNameTaken(data.name, data.id)) throw new Error("同名分类已存在");
  const res = await db
    .update(software_category)
    .set({ name: data.name, updated_at: new Date() })
    .where(eq(software_category.id, data.id))
    .returning({ id: software_category.id });
  if (!res.length) throw new Error("分类不存在");
  revalidatePath("/software");
  return { ok: true };
}
