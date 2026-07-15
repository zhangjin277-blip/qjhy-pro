"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { software_category, software_item } from "@/db/schema/software";
import { requireSoftwarePoint } from "../authz";
import { UpdateItemInput } from "../schema";

export async function updateItem(input: unknown): Promise<{ ok: true }> {
  const data = UpdateItemInput.parse(input);
  await requireSoftwarePoint("item_edit");

  if (typeof data.categoryId === "number") {
    const [cat] = await db
      .select({ id: software_category.id })
      .from(software_category)
      .where(eq(software_category.id, data.categoryId))
      .limit(1);
    if (!cat) throw new Error("目标分类不存在");
  }

  const patch: Partial<typeof software_item.$inferInsert> = { updated_at: new Date() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.version !== undefined) patch.version = data.version?.trim() || null;
  if (data.note !== undefined) patch.note = data.note?.trim() || null;
  if (data.categoryId !== undefined) patch.category_id = data.categoryId;

  const res = await db
    .update(software_item)
    .set(patch)
    .where(and(eq(software_item.id, data.id), isNull(software_item.deleted_at)))
    .returning({ id: software_item.id });
  if (!res.length) throw new Error("软件不存在或已删除");

  revalidatePath("/software");
  return { ok: true };
}
