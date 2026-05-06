// src/scripts/verify-placement-migration.ts
import Database from "better-sqlite3";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";

interface CliOpts {
  pro3Db: string;
  sampleAccount: string;
  date: string;
}

function parseArgs(): CliOpts {
  const args = process.argv.slice(2);
  const get = (k: string): string | undefined => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    pro3Db: get("pro3-db") ?? "/Users/zhangjin/miracle-pro3/server/database.sqlite",
    sampleAccount: get("sample-account") ?? "",
    date: get("date") ?? "",
  };
}

interface Pro3ContentRow {
  content: string;
}

interface QjhyTotalRow extends Record<string, unknown> {
  total: string | null;
}

async function main() {
  const opts = parseArgs();
  if (!opts.sampleAccount || !opts.date) {
    console.error("用法：--sample-account <账号名称> --date <YYYY-MM-DD>");
    process.exit(1);
  }

  // PRO3 该账号该日总消耗（所有 custom-ds- 数据集）
  const sqlite = new Database(opts.pro3Db, { readonly: true });
  const pro3Rows = sqlite
    .prepare(`SELECT content FROM business_data WHERE type LIKE 'custom-ds-%' AND data_date = ?`)
    .all(opts.date) as Pro3ContentRow[];
  sqlite.close();

  const pro3Total = pro3Rows.reduce((sum, r) => {
    try {
      const c = JSON.parse(r.content) as Record<string, unknown>;
      // 账户名称字段兼容 账户名称 / 直播间
      const name = c["账户名称"] ?? c["直播间"];
      if (typeof name === "string" && name.trim() === opts.sampleAccount) {
        const cost = c["消耗"] ?? c["花费"] ?? 0;
        const num =
          typeof cost === "number" ? cost : Number(String(cost).replace(/[元¥%,\s]/g, "")) || 0;
        return sum + num;
      }
    } catch {
      // skip
    }
    return sum;
  }, 0);

  // qjhy-pro 该账号该日总消耗（via placement_label 匹配）
  const qjRows = await db.execute<QjhyTotalRow>(sql`
    SELECT SUM(p.cost_yuan)::numeric AS total
    FROM placement_row p
    JOIN live_account a ON a.id = p.live_account_id
    WHERE a.placement_label = ${opts.sampleAccount}
      AND p.date = ${opts.date}
  `);
  const qjTotal = Number(qjRows.at(0)?.total ?? 0);

  const diff = Math.abs(pro3Total - qjTotal);
  const errPct = pro3Total > 0 ? (diff / pro3Total) * 100 : 0;

  console.log(`\n=== 抽样校验 ${opts.sampleAccount} @ ${opts.date} ===`);
  console.log(`PRO3 总消耗:     ¥${pro3Total.toFixed(2)}`);
  console.log(`qjhy-pro 总消耗: ¥${qjTotal.toFixed(2)}`);
  console.log(`绝对差:          ¥${diff.toFixed(2)}`);
  console.log(`误差率:          ${errPct.toFixed(4)}%`);
  console.log(errPct < 0.01 ? "\nPASS（误差 < 0.01%）" : "\nFAIL（误差超阈值）");
  process.exit(errPct < 0.01 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
