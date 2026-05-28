/**
 * 一次性脚本：初始化 6 个产品分类。
 * 只需在新部署时跑一次，幂等（onConflictDoNothing）。
 *
 * Usage:
 *   pnpm db:seed:product-config
 */
import { db } from "@/db/client";
import { product_config } from "@/db/schema";

const PRODUCTS = [
  {
    product_name: "捕鱼大作战",
    display_short: "捕鱼",
    accent_color: "#1677ff",
  },
  { product_name: "途游斗地主", display_short: "斗地主", accent_color: "#d4a853" },
  {
    product_name: "三国冰河时代",
    display_short: "三国",
    accent_color: "#a855f7",
  },
  { product_name: "富豪麻将", display_short: "麻将", accent_color: "#10b981" },
  { product_name: "电玩捕鱼", display_short: "电玩", accent_color: "#ef4444" },
  {
    product_name: "途游休闲捕鱼",
    display_short: "休闲",
    accent_color: "#06b6d4",
  },
];

async function main() {
  console.log("[seed] seeding product configs...");
  await db.insert(product_config).values(PRODUCTS).onConflictDoNothing();
  console.log(`[seed] seeded ${PRODUCTS.length} product configs`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
