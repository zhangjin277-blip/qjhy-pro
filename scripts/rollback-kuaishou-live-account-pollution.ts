/**
 * 一次性回滚：撤销之前 sync-kuaishou-members 对 live_account 的污染。
 *
 * 之前 sync 错误地往 live_account 直接 UPSERT 了 78 行（66 INSERT + 12 UPDATE）。
 * 现在改成同步到独立的 kuaishou_member 表，需要把 live_account 恢复到同步前的状态：
 *
 *   1. raw->'kuaishou_sync' IS NOT NULL + 没业务关联（无 placement_label / 无排班）
 *      → DELETE（这些是同步新建、不该出现在 /live-accounts 的孤儿账号）
 *
 *   2. raw->'kuaishou_sync' IS NOT NULL + 有业务关联
 *      → UPDATE：仅删除 raw 里的 kuaishou_sync 子键
 *      （avatar/platform_account_id 等被同步覆盖过的字段无法精确恢复，但保留无害——
 *        头像本来就该填，platform_account_id 本来就该是真实快手 ID）
 *
 * pnpm tsx --env-file=.env.local scripts/rollback-kuaishou-live-account-pollution.ts [--apply]
 */
import "dotenv/config";
import { db } from "../src/db/client";
import { sql } from "drizzle-orm";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  // 哪些会被 DELETE
  const deleteCond = sql`
    platform = '快手'
    AND raw->'kuaishou_sync' IS NOT NULL
    AND placement_label IS NULL
    AND NOT EXISTS (SELECT 1 FROM account_anchor_default d WHERE d.account_id = live_account.id)
    AND NOT EXISTS (SELECT 1 FROM schedule_override o WHERE o.account_id = live_account.id)
  `;
  // 哪些会被 UPDATE 清掉 raw.kuaishou_sync 子键（保留 row）
  const cleanRawCond = sql`
    platform = '快手'
    AND raw->'kuaishou_sync' IS NOT NULL
    AND (
      placement_label IS NOT NULL
      OR EXISTS (SELECT 1 FROM account_anchor_default d WHERE d.account_id = live_account.id)
      OR EXISTS (SELECT 1 FROM schedule_override o WHERE o.account_id = live_account.id)
    )
  `;

  const toDelete = await db.execute(sql`
    SELECT account_name, product, raw->'kuaishou_sync'->>'broker_name_raw' AS broker
    FROM live_account WHERE ${deleteCond}
    ORDER BY product, account_name
  `);
  const toClean = await db.execute(sql`
    SELECT account_name, product, placement_label,
           EXISTS (SELECT 1 FROM account_anchor_default d WHERE d.account_id = live_account.id) AS has_default,
           EXISTS (SELECT 1 FROM schedule_override o WHERE o.account_id = live_account.id) AS has_override
    FROM live_account WHERE ${cleanRawCond}
    ORDER BY product, account_name
  `);

  console.log(`[rollback] DELETE 候选 ${toDelete.length} 行：`);
  for (const r of toDelete) {
    console.log(`  - [${r.product}] ${r.account_name} broker=${r.broker ?? "-"}`);
  }
  console.log(`\n[rollback] UPDATE 候选 ${toClean.length} 行（仅清 raw.kuaishou_sync）：`);
  for (const r of toClean) {
    const reasons: string[] = [];
    if (r.placement_label) reasons.push(`label=${r.placement_label}`);
    if (r.has_default) reasons.push("有默认排班");
    if (r.has_override) reasons.push("有 override");
    console.log(`  - [${r.product}] ${r.account_name} (${reasons.join(",")})`);
  }

  if (!apply) {
    console.log("\n[rollback] DRY RUN（默认）。跑 --apply 才会真改");
    process.exit(0);
  }

  const updated = await db.execute(sql`
    UPDATE live_account
    SET raw = raw - 'kuaishou_sync', updated_at = NOW()
    WHERE ${cleanRawCond}
    RETURNING id
  `);
  console.log(`[rollback] 清掉 raw.kuaishou_sync ${updated.length} 行`);

  const deleted = await db.execute(sql`
    DELETE FROM live_account WHERE ${deleteCond} RETURNING id
  `);
  console.log(`[rollback] DELETE ${deleted.length} 行`);
  process.exit(0);
}

void main();
