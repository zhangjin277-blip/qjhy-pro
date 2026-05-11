/**
 * 一次性脚本：创建一个 email/password 测试登录账号，并把它绑定到某个真实钉钉用户。
 *
 * 用途：本地测试权限系统时，不需要钉钉扫码就能模拟"某个钉钉同事"的视角。
 *
 * Usage:
 *   pnpm tsx scripts/seed-test-user.ts             # 默认绑定龚诗彧
 *   pnpm tsx scripts/seed-test-user.ts 朱江源      # 绑定到另一个人
 *   pnpm tsx scripts/seed-test-user.ts --restore   # 还原 dingtalk_user.unionid 到 user_id（清理）
 *
 * 测试完跑 --restore 把数据恢复，避免影响后续测试。
 */
/* 用 `pnpm tsx --env-file=.env.local scripts/seed-test-user.ts` 跑 */
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { auth_user, dingtalk_user } from "@/db/schema";

const TEST_EMAIL = "test@qjhy.local";
const TEST_PASSWORD = "test123456";

async function main() {
  const args = process.argv.slice(2);
  const isRestore = args.includes("--restore");
  const targetName = args.filter((a) => !a.startsWith("--"))[0] ?? "龚诗彧";

  if (isRestore) {
    console.log("（用 SQL 还原 unionid，请运行）");
    console.log(`UPDATE dingtalk_user SET unionid = user_id WHERE name = '${targetName}';`);
    process.exit(0);
  }

  // 1. 找目标钉钉用户
  const [target] = await db.select().from(dingtalk_user).where(eq(dingtalk_user.name, targetName));
  if (!target) {
    console.error(`[seed-test] 找不到钉钉用户: ${targetName}`);
    process.exit(1);
  }
  console.log(
    `[seed-test] 目标用户: ${target.name} (user_id=${target.user_id}, dept_ids=${JSON.stringify(target.dept_ids)})`,
  );

  // 2. 创建或查找测试 auth_user
  let [existing] = await db.select().from(auth_user).where(eq(auth_user.email, TEST_EMAIL));
  if (!existing) {
    console.log("[seed-test] 创建测试用户...");
    const result = await auth.api.signUpEmail({
      body: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        name: `测试-${targetName}`,
      },
    });
    if (!result.user) {
      console.error("[seed-test] 创建失败");
      process.exit(1);
    }
    existing = (await db.select().from(auth_user).where(eq(auth_user.email, TEST_EMAIL)))[0];
    if (!existing) {
      console.error("[seed-test] 创建后查不到测试用户，异常");
      process.exit(1);
    }
  } else {
    console.log(`[seed-test] 测试用户已存在: ${existing.id}`);
  }

  // 3. 把目标钉钉用户的 unionid 改成测试 user.id
  await db
    .update(dingtalk_user)
    .set({ unionid: existing.id })
    .where(eq(dingtalk_user.user_id, target.user_id));

  console.log("");
  console.log("==========================================");
  console.log("✅ 测试账号已就绪");
  console.log("==========================================");
  console.log(`📧 Email:    ${TEST_EMAIL}`);
  console.log(`🔑 Password: ${TEST_PASSWORD}`);
  console.log(`👤 模拟身份: ${target.name} (${target.user_id})`);
  console.log(`🏢 部门 IDs: ${JSON.stringify(target.dept_ids)}`);
  console.log("");
  console.log("登录方式：");
  console.log("  1. pnpm dev（如果还没起）");
  console.log("  2. 浏览器 http://localhost:3000/login");
  console.log("  3. 用上面 Email/Password 登录（不是钉钉扫码）");
  console.log("");
  console.log("测试完成后清理：");
  console.log(`  pnpm tsx scripts/seed-test-user.ts --restore ${targetName}`);
  console.log("");
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-test] failed:", err);
  process.exit(1);
});
