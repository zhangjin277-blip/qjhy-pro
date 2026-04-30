/**
 * 一次性脚本：创建应急后门用户。
 * 只需在新部署时跑一次，幂等（已存在则跳过）。
 *
 * Usage:
 *   pnpm db:seed:emergency
 */
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { auth_user } from "@/db/schema";
import { env } from "@/lib/env";

const EMERGENCY_EMAIL = "emergency@qjhy.local";

async function main() {
  console.log("[seed] checking emergency user...");

  const [existing] = await db.select().from(auth_user).where(eq(auth_user.email, EMERGENCY_EMAIL));

  if (existing) {
    console.log("[seed] emergency user already exists:", existing.id);
    process.exit(0);
  }

  console.log("[seed] creating emergency user...");
  const result = await auth.api.signUpEmail({
    body: {
      email: EMERGENCY_EMAIL,
      password: env.EMERGENCY_LOGIN_PASSWORD,
      name: "Emergency Admin",
    },
  });

  console.log("[seed] created:", result.user?.id);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
