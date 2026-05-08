/**
 * 一次性 cleanup：删除上一轮快手同步入库的、不在线下主播范围（陈家乐 + 10 天活跃）、
 * 且无业务关联（无 placement_label / 无排班）的账号。
 *
 * 条件（同时满足才删）：
 *   1. platform='快手'
 *   2. raw->'kuaishou_sync' 存在（本次同步触及）
 *   3. 不在范围（broker_name_raw != '陈家乐' OR last_live_time 超过 10 天）
 *   4. placement_label IS NULL（没绑投放）
 *   5. 无 account_anchor_default 关联（没默认排班）
 *   6. 无 schedule_override 关联（没临时排班）
 *
 * 跑前会先 SELECT 列出待删行，二次确认。
 *
 * pnpm tsx --env-file=.env.local scripts/cleanup-kuaishou-out-of-scope.ts [--apply]
 */
import "dotenv/config";
import { db } from "../src/db/client";
import { sql } from "drizzle-orm";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  // 业务范围：仅清理「快手 + 捕鱼项目 + 同步引入 + 不在线下主播范围 + 无业务数据」
  // 显式排除昵称含「斗地主」「三国」的（这些项目本次不处理，避免误删）
  const cond = sql`
    platform = '快手'
    AND raw->'kuaishou_sync' IS NOT NULL
    AND product NOT IN ('迷游斗地主', '三国冰河时代', '富豪麻将')
    AND account_name NOT LIKE '%斗地主%'
    AND account_name NOT LIKE '%三国%'
    AND account_name NOT LIKE '%麻将%'
    AND NOT (
      raw->'kuaishou_sync'->>'broker_name_raw' = '陈家乐'
      AND (raw->'kuaishou_sync'->>'last_live_time')::timestamptz >= NOW() - INTERVAL '10 days'
    )
    AND placement_label IS NULL
    AND NOT EXISTS (SELECT 1 FROM account_anchor_default d WHERE d.account_id = live_account.id)
    AND NOT EXISTS (SELECT 1 FROM schedule_override o WHERE o.account_id = live_account.id)
  `;

  const preview = await db.execute(sql`
    SELECT account_name, platform_account_id,
           raw->'kuaishou_sync'->>'broker_name_raw' AS broker,
           raw->'kuaishou_sync'->>'last_live_time' AS last_live
    FROM live_account
    WHERE ${cond}
    ORDER BY broker NULLS FIRST, account_name
  `);

  console.log(`[cleanup] 待删 ${preview.length} 行：`);
  for (const r of preview) {
    console.log(
      `  - ${r.account_name} (ks=${r.platform_account_id}) broker=${r.broker ?? "-"} last_live=${r.last_live ?? "-"}`,
    );
  }

  if (!apply) {
    console.log("\n[cleanup] DRY RUN（默认）。跑 --apply 才会真删");
    process.exit(0);
  }

  const deleted = await db.execute(sql`
    DELETE FROM live_account WHERE ${cond} RETURNING id
  `);
  console.log(`[cleanup] 实际删除 ${deleted.length} 行`);
  process.exit(0);
}

void main();
