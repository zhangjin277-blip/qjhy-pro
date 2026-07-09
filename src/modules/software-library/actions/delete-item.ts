"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { software_item } from "@/db/schema/software";
import { requireSoftwareWriter } from "../authz";
import { DeleteItemInput } from "../schema";

/** 软删（NAS 文件保留，需要时可人工恢复）。 */
export async function deleteItem(input: unknown): Promise<{ ok: true }> {
  const data = DeleteItemInput.parse(input);
  await requireSoftwareWriter();
  const res = await db
    .update(software_item)
    .set({ deleted_at: new Date() })
    .where(and(eq(software_item.id, data.id), isNull(software_item.deleted_at)))
    .returning({ id: software_item.id });
  if (!res.length) throw new Error("软件不存在或已删除");
  revalidatePath("/software");
  return { ok: true };
}
