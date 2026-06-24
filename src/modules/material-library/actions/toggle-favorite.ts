"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { material_favorite } from "@/db/schema/material";
import { requireMaterialViewer } from "../authz";
import { z } from "zod";

const Input = z.object({ assetId: z.number().int().positive() });

/** 收藏 / 取消收藏（幂等）。返回最终是否已收藏。 */
export async function toggleFavorite(input: unknown): Promise<{ ok: true; favorited: boolean }> {
  const { assetId } = Input.parse(input);
  const { userId } = await requireMaterialViewer();

  const [existing] = await db
    .select({ id: material_favorite.id })
    .from(material_favorite)
    .where(and(eq(material_favorite.asset_id, assetId), eq(material_favorite.user_id, userId)));

  if (existing) {
    await db.delete(material_favorite).where(eq(material_favorite.id, existing.id));
    revalidatePath("/materials");
    return { ok: true, favorited: false };
  }

  await db.insert(material_favorite).values({ asset_id: assetId, user_id: userId });
  revalidatePath("/materials");
  return { ok: true, favorited: true };
}
