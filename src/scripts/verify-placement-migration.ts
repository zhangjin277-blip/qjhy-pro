// src/scripts/verify-placement-migration.ts
//
// 校验 PRO3 历史迁移数据正确性。
// 以 anchorName（如"蓝V"）为归因 key，对比 PRO3 SQLite 与 qjhy-pro DB 的每日总消耗。
//
// 用法：
//   NODE_OPTIONS="--conditions=react-server" pnpm tsx --env-file=.env.local \
//     src/scripts/verify-placement-migration.ts \
//     --pro3-db /path/to/database.sqlite \
//     --sample-anchor "蓝V" --date 2026-04-15
import Database from "better-sqlite3";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";

interface CliOpts {
  pro3Db: string;
  /** PRO3 anchorName 字段值，如「蓝V」「欧阳疯」 */
  sampleAnchor: string;
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
    // 支持新参数名 --sample-anchor，同时兼容旧参数名 --sample-account
    sampleAnchor: get("sample-anchor") ?? get("sample-account") ?? "",
    date: get("date") ?? "",
  };
}

interface Pro3AccountMaxRow {
  account_name: string;
  max_cost: number;
}

interface QjhyTotalRow extends Record<string, unknown> {
  total: string | null;
}

async function main() {
  const opts = parseArgs();
  if (!opts.sampleAnchor || !opts.date) {
    console.error("用法：--sample-anchor <anchorName> --date <YYYY-MM-DD>");
    process.exit(1);
  }

  // PRO3 该 anchorName 该日总消耗（所有 custom-ds- 数据集）
  //
  // PRO3 raw data 是按广告账户、按小时的累计值（当日 00:00 起的累计消耗）。
  // 正确的日消耗 = 每个广告账户当天 h≥1 的最大累计值之和（h=0 携带的是前一天的最终值，需排除）。
  // 这与 qjhy-pro 的 computeIncrements 处理后求和在理论上等价。
  //
  // 日期用 substr 前 10 位比较，兼容 PRO3 data_date 的 "YYYY-MM-DD HH:MM:SS" 格式
  const sqlite = new Database(opts.pro3Db, { readonly: true });
  const pro3AccountRows = sqlite
    .prepare(
      `SELECT
         json_extract(content, '$.账户名称')  AS account_name,
         MAX(CASE WHEN json_extract(content, '$.dataHour') > 0
                  THEN CAST(json_extract(content, '$.消耗') AS REAL)
                  ELSE 0
             END) AS max_cost
       FROM business_data
       WHERE type LIKE 'custom-ds-%'
         AND substr(data_date, 1, 10) = ?
         AND json_extract(content, '$.anchorName') = ?
       GROUP BY json_extract(content, '$.账户名称')`,
    )
    .all(opts.date, opts.sampleAnchor) as Pro3AccountMaxRow[];
  sqlite.close();

  const pro3Total = pro3AccountRows.reduce((sum, r) => sum + (r.max_cost || 0), 0);

  // qjhy-pro 该 anchorName 该日总消耗（via placement_label 匹配）
  const qjRows = await db.execute<QjhyTotalRow>(sql`
    SELECT SUM(p.cost_yuan)::numeric AS total
    FROM placement_row p
    JOIN live_account a ON a.id = p.live_account_id
    WHERE a.placement_label = ${opts.sampleAnchor}
      AND p.date = ${opts.date}
  `);
  const qjTotal = Number(qjRows.at(0)?.total ?? 0);

  const diff = Math.abs(pro3Total - qjTotal);
  const errPct = pro3Total > 0 ? (diff / pro3Total) * 100 : 0;
  const THRESHOLD = 0.5;

  console.log(`\n=== 抽样校验 ${opts.sampleAnchor} @ ${opts.date} ===`);
  console.log(`PRO3 总消耗:     ¥${pro3Total.toFixed(2)}`);
  console.log(`qjhy-pro 总消耗: ¥${qjTotal.toFixed(2)}`);
  console.log(`绝对差:          ¥${diff.toFixed(2)}`);
  console.log(`误差率:          ${errPct.toFixed(4)}%`);
  console.log(
    errPct < THRESHOLD ? `\nPASS（误差 < ${THRESHOLD}%）` : `\nFAIL（误差超 ${THRESHOLD}% 阈值）`,
  );
  process.exit(errPct < THRESHOLD ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
