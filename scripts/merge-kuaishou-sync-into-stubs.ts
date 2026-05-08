/**
 * B 方案：把本次同步引入的 78 行 live_account 合并/清理回原 stub。
 *
 * 三类处理：
 *   1. 映射到旧 stub 的 10 对 → 合并字段 + 转移排班/override 关联 + 删除同步行
 *   2. 已配 placement_label、无对应旧 stub 的 3 行 → 保留 row，仅清 raw.kuaishou_sync
 *   3. 其他同步引入的 65 行 → 直接 DELETE
 *
 * pnpm tsx --env-file=.env.local scripts/merge-kuaishou-sync-into-stubs.ts [--apply]
 */
import "dotenv/config";
import { db } from "../src/db/client";
import { sql } from "drizzle-orm";

const MERGE_MAP: Record<string, string> = {
  "二师兄-捕鱼大作战": "二师兄",
  "小美-捕鱼大作战": "小美",
  "少爷-捕鱼大作战": "少爷",
  捕鱼大作战: "蓝V",
  捕鱼大作战3D版: "3D版",
  "欧阳大帝－捕鱼大作战": "欧阳疯",
  "超级小胖-捕鱼大作战": "小胖",
  "电玩捕鱼-超高爆": "超高爆",
  "电玩捕鱼—易疯": "易疯", // 注意：中文长破折号
  途游休闲捕鱼大玩家: "大玩家",
  途游休闲捕鱼超能爆: "超能爆",
  途游休闲捕鱼达人: "捕鱼达人",
  "途游休闲捕鱼-二当家": "二当家",
  "途游休闲捕鱼-六娘子": "六娘子",
};

interface Row {
  id: string;
  account_name: string;
  product: string;
  platform_account_id: string | null;
  avatar: string | null;
  agent_dingtalk_user_id: string | null;
  live_status: string;
  placement_label: string | null;
  raw: Record<string, unknown>;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  // ── 阶段 1：合并映射的 10 对 ────────────────────────────────────────
  console.log("=== 阶段 1：合并映射对 → 旧 stub ===");
  const mergePlan: { sync: Row; stub: Row }[] = [];
  const skippedNoStub: string[] = [];
  for (const [syncName, stubName] of Object.entries(MERGE_MAP)) {
    const syncRows = (await db.execute(sql`
      SELECT id, account_name, product, platform_account_id, avatar,
             agent_dingtalk_user_id, live_status, placement_label, raw
      FROM live_account
      WHERE platform='快手' AND account_name=${syncName}
        AND raw->'kuaishou_sync' IS NOT NULL
      LIMIT 1
    `)) as unknown as Row[];
    const stubRows = (await db.execute(sql`
      SELECT id, account_name, product, platform_account_id, avatar,
             agent_dingtalk_user_id, live_status, placement_label, raw
      FROM live_account
      WHERE platform='快手' AND account_name=${stubName}
        AND raw->'kuaishou_sync' IS NULL
      LIMIT 1
    `)) as unknown as Row[];
    const sync = syncRows[0];
    const stub = stubRows[0];
    if (!sync) {
      console.warn(`  ⚠️ 同步行不存在: ${syncName}`);
      continue;
    }
    if (!stub) {
      console.warn(`  ⚠️ 旧 stub 不存在: ${stubName}（同步行 ${syncName} 跳过）`);
      skippedNoStub.push(`${syncName} → ${stubName}`);
      continue;
    }
    mergePlan.push({ sync, stub });
    console.log(
      `  ✓ ${syncName} (ks=${sync.platform_account_id}) → ${stubName} (label=${stub.placement_label ?? "-"})`,
    );
  }

  // ── 阶段 2：3 个"已 label 但无对应 stub" → 保留 row，清 sync 子键 ────
  console.log("\n=== 阶段 2：保留 row 仅清 raw.kuaishou_sync（已绑 placement_label） ===");
  const keepNames = ["电玩捕鱼", "电玩捕鱼-百万倍率", "途游休闲捕鱼"];
  const keepRows = (await db.execute(sql`
    SELECT id, account_name, placement_label
    FROM live_account
    WHERE platform='快手'
      AND raw->'kuaishou_sync' IS NOT NULL
      AND account_name IN (${sql.join(
        keepNames.map((n) => sql`${n}`),
        sql`, `,
      )})
  `)) as unknown as { id: string; account_name: string; placement_label: string | null }[];
  for (const r of keepRows) {
    console.log(`  ✓ ${r.account_name} (label=${r.placement_label ?? "-"})`);
  }

  // ── 阶段 3：其他孤儿 → DELETE ───────────────────────────────────────
  console.log("\n=== 阶段 3：DELETE 其他同步引入的孤儿 ===");
  const mergedIds = mergePlan.map((m) => m.sync.id);
  const keepIds = keepRows.map((r) => r.id);
  const protectedIds = [...mergedIds, ...keepIds];
  const placeholders = protectedIds.length
    ? sql.join(
        protectedIds.map((id) => sql`${id}`),
        sql`, `,
      )
    : sql`NULL`;

  const deleteRows = (await db.execute(sql`
    SELECT id, account_name, product
    FROM live_account
    WHERE platform='快手'
      AND raw->'kuaishou_sync' IS NOT NULL
      AND id NOT IN (${placeholders})
    ORDER BY product, account_name
  `)) as unknown as { id: string; account_name: string; product: string }[];
  console.log(`  DELETE 总数 ${deleteRows.length}：`);
  for (const r of deleteRows.slice(0, 20)) {
    console.log(`    - [${r.product}] ${r.account_name}`);
  }
  if (deleteRows.length > 20) console.log(`    ... 省略 ${deleteRows.length - 20} 行`);

  console.log(
    `\n汇总：合并 ${mergePlan.length} 对 + 保留 ${keepRows.length} 行 + 删除 ${deleteRows.length} 行 = ${mergePlan.length + keepRows.length + deleteRows.length} 行总动`,
  );

  if (skippedNoStub.length > 0) {
    console.log(`\n⚠️ 这些映射对找不到旧 stub，需要你手工处理：`);
    skippedNoStub.forEach((s) => console.log(`   ${s}`));
  }

  if (!apply) {
    console.log("\nDRY RUN（默认）。跑 --apply 才会真改");
    process.exit(0);
  }

  // ── apply ─────────────────────────────────────────────────────────
  console.log("\n=== APPLY ===");
  for (const { sync, stub } of mergePlan) {
    // 合并字段到 stub（avatar/快手ID/经纪人/live_status；placement_label 保留 stub 的）
    await db.execute(sql`
      UPDATE live_account SET
        platform_account_id = COALESCE(${stub.platform_account_id}, ${sync.platform_account_id}),
        avatar = ${sync.avatar},
        agent_dingtalk_user_id = COALESCE(${sync.agent_dingtalk_user_id}, ${stub.agent_dingtalk_user_id}),
        live_status = ${sync.live_status},
        updated_at = NOW()
      WHERE id = ${stub.id}
    `);
    // 转移排班关联
    await db.execute(sql`
      UPDATE account_anchor_default SET account_id = ${stub.id} WHERE account_id = ${sync.id}
    `);
    await db.execute(sql`
      UPDATE schedule_override SET account_id = ${stub.id} WHERE account_id = ${sync.id}
    `);
    // 转移 placement_row：先删冲突行（stub 已有同 date/hour/dataset 的就丢同步行的）
    await db.execute(sql`
      DELETE FROM placement_row WHERE live_account_id = ${sync.id}
        AND (date, hour, dataset_id) IN (
          SELECT date, hour, dataset_id FROM placement_row WHERE live_account_id = ${stub.id}
        )
    `);
    await db.execute(sql`
      UPDATE placement_row SET live_account_id = ${stub.id} WHERE live_account_id = ${sync.id}
    `);
    // 删除同步行
    await db.execute(sql`DELETE FROM live_account WHERE id = ${sync.id}`);
  }
  console.log(`合并完成 ${mergePlan.length} 对`);

  // 清掉保留行的 raw.kuaishou_sync
  if (keepIds.length > 0) {
    await db.execute(sql`
      UPDATE live_account SET raw = raw - 'kuaishou_sync', updated_at = NOW()
      WHERE id IN (${sql.join(
        keepIds.map((id) => sql`${id}`),
        sql`, `,
      )})
    `);
    console.log(`清 sync 子键 ${keepIds.length} 行`);
  }

  // 删孤儿
  const deleted = await db.execute(sql`
    DELETE FROM live_account
    WHERE platform='快手'
      AND raw->'kuaishou_sync' IS NOT NULL
      AND id NOT IN (${
        keepIds.length > 0
          ? sql.join(
              keepIds.map((id) => sql`${id}`),
              sql`, `,
            )
          : sql`NULL`
      })
    RETURNING id
  `);
  console.log(`删孤儿 ${deleted.length} 行`);

  process.exit(0);
}

void main();
