"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { software_category } from "@/db/schema/software";
import { requireSoftwarePoint } from "../authz";
import { categoryHasActiveItems } from "../queries";
import { DeleteCategoryInput } from "../schema";

/** 删除分类：分类下还有未删软件则拒绝，避免悬空引用。 */
export async function deleteCategory(input: unknown): Promise<{ ok: true }> {
  const data = DeleteCategoryInput.parse(input);
  await requireSoftwarePoint("item_delete");

  if (await categoryHasActiveItems(data.id)) throw new Error("该分类下还有软件，请先移走或删除");

  const res = await db
    .delete(software_category)
    .where(eq(software_category.id, data.id))
    .returning({ id: software_category.id });
  if (!res.length) throw new Error("分类不存在");

  revalidatePath("/software");
  return { ok: true };
}
