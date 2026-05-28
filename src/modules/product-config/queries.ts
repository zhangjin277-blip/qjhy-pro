import "server-only";
import { db } from "@/db/client";
import { product_config } from "@/db/schema";
import { asc } from "drizzle-orm";

export interface ProductOption {
  productName: string;
  displayShort: string;
  accentColor: string;
  category: string;
}

/**
 * 获取所有产品配置列表。
 */
export async function listProducts(): Promise<ProductOption[]> {
  const rows = await db
    .select({
      product_name: product_config.product_name,
      display_short: product_config.display_short,
      accent_color: product_config.accent_color,
      category: product_config.category,
    })
    .from(product_config)
    .orderBy(asc(product_config.category), asc(product_config.product_name));

  return rows.map((r) => ({
    productName: r.product_name,
    displayShort: r.display_short,
    accentColor: r.accent_color,
    category: r.category,
  }));
}
