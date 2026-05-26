"use server";

import { db } from "@/db/client";
import { product_config, live_account } from "@/db/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const ProductInput = z.object({
  productName: z.string().min(1).max(50),
  displayShort: z.string().min(1).max(20),
  accentColor: z.string().regex(HEX_RE, "需为 #RRGGBB 格式"),
});

const UpdateInput = ProductInput.pick({ displayShort: true, accentColor: true }).extend({
  productName: z.string().min(1),
});

const DeleteInput = z.object({ productName: z.string().min(1) });

export async function createProduct(input: unknown): Promise<{ ok: true }> {
  await requireAdmin();
  const data = ProductInput.parse(input);
  await db.insert(product_config).values({
    product_name: data.productName,
    display_short: data.displayShort,
    accent_color: data.accentColor,
  });
  return { ok: true };
}

export async function updateProduct(input: unknown): Promise<{ ok: true }> {
  await requireAdmin();
  const data = UpdateInput.parse(input);
  await db
    .update(product_config)
    .set({
      display_short: data.displayShort,
      accent_color: data.accentColor,
    })
    .where(eq(product_config.product_name, data.productName));
  return { ok: true };
}

export async function deleteProduct(input: unknown): Promise<{ ok: true }> {
  await requireAdmin();
  const data = DeleteInput.parse(input);

  // 检查是否还有 live_account 引用
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(live_account)
    .where(eq(live_account.product, data.productName));
  const count = rows[0]?.count ?? 0;

  if (count > 0) {
    throw new Error(`无法删除：还有 ${count} 个 live_account 引用此产品`);
  }

  await db.delete(product_config).where(eq(product_config.product_name, data.productName));
  return { ok: true };
}
