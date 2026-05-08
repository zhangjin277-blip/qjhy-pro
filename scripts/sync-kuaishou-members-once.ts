/**
 * 一次性触发 syncKuaishouMembersHandler（绕过 pg-boss，直接调 handler）。
 * 用途：Phase 2.3a 端到端验证，第一次跑同步。
 *
 * pnpm tsx --env-file=.env.local scripts/sync-kuaishou-members-once.ts
 */
import "dotenv/config";
import { syncKuaishouMembersHandler } from "../src/worker/jobs/handlers/sync-kuaishou-members";
import { closeBrowser } from "../src/lib/puppeteer";

async function main(): Promise<void> {
  const t0 = Date.now();
  try {
    const result = await syncKuaishouMembersHandler();
    console.log(`[done] in ${Math.round((Date.now() - t0) / 1000)}s`, result);
  } finally {
    await closeBrowser().catch((err) => {
      console.warn("[close-browser] failed:", err);
    });
    process.exit(0);
  }
}

void main();
