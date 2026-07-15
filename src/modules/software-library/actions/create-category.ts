"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { software_category } from "@/db/schema/software";
import { requireSoftwarePoint } from "../authz";
import { categoryNameTaken } from "../queries";
import { CreateCategoryInput } from "../schema";

export async function createCategory(input: unknown): Promise<{ ok: true; id: number }> {
  const data = CreateCategoryInput.parse(input);
  await requireSoftwarePoint("item_edit");
  if (await categoryNameTaken(data.name)) throw new Error("同名分类已存在");
  const [row] = await db
    .insert(software_category)
    .values({ name: data.name })
    .returning({ id: software_category.id });
  if (!row) throw new Error("创建分类失败");
  revalidatePath("/software");
  return { ok: true, id: row.id };
}
