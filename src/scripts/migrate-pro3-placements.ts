// src/scripts/migrate-pro3-placements.ts
import { readPro3Placements, type Pro3Dataset } from "@/modules/placement/pro3-adapter";
import { ingestRows } from "@/modules/placement/server";
import { runAttributionJob } from "@/modules/placement-attribution/server";

interface CliOpts {
  pro3Db: string;
  datasets: Pro3Dataset[];
  dateFrom: string | undefined;
  dateTo: string | undefined;
  dryRun: boolean;
  forceReimport: boolean;
}

function parseArgs(): CliOpts {
  const args = process.argv.slice(2);
  const get = (k: string): string | undefined => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const has = (k: string) => args.includes(`--${k}`);

  const pro3Db = get("pro3-db") ?? "/Users/zhangjin/miracle-pro3/server/database.sqlite";
  const datasetsStr = get("datasets") ?? "product_buyu,product_ue4,product_urp";
  const dateRange = get("date-range");
  const [dateFrom, dateTo] = dateRange ? dateRange.split(":") : [undefined, undefined];

  return {
    pro3Db,
    datasets: datasetsStr.split(",") as Pro3Dataset[],
    dateFrom: dateFrom ?? undefined,
    dateTo: dateTo ?? undefined,
    dryRun: has("dry-run"),
    forceReimport: has("force-reimport"),
  };
}

async function main() {
  const opts = parseArgs();

  if (opts.dryRun) {
    const report: {
      datasets: {
        id: string;
        rows: number;
        date_from: string;
        date_to: string;
        account_count: number;
      }[];
    } = { datasets: [] };

    for (const dataset of opts.datasets) {
      const rows = readPro3Placements(opts.pro3Db, dataset, {
        date_from: opts.dateFrom,
        date_to: opts.dateTo,
      });
      const accounts = new Set(rows.map((r) => r.account_name));
      const dates = rows.map((r) => r.date).sort();
      report.datasets.push({
        id: dataset,
        rows: rows.length,
        date_from: dates.at(0) ?? "",
        date_to: dates.at(-1) ?? "",
        account_count: accounts.size,
      });
    }

    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  // 实际写入模式
  console.error(`\n=== PRO3 投放数据迁移 — 实际写入 ===`);
  console.error(`SQLite: ${opts.pro3Db}`);
  console.error(`数据集: ${opts.datasets.join(", ")}`);
  console.error(`日期范围: ${opts.dateFrom ?? "全部"} ~ ${opts.dateTo ?? "全部"}\n`);

  for (const dataset of opts.datasets) {
    console.error(`\n--- 处理 ${dataset} ---`);
    const rows = readPro3Placements(opts.pro3Db, dataset, {
      date_from: opts.dateFrom,
      date_to: opts.dateTo,
    });
    console.error(`读出 ${rows.length} 行`);

    const batch = await ingestRows({
      source: "pro3-migration",
      dataset_id: dataset,
      file_name: `pro3-${dataset}-${new Date().toISOString().slice(0, 10)}.batch`,
      uploaded_by: null,
      rows,
      parse_errors: [],
    });

    console.error(
      `batch=${batch.id} inserted=${batch.rows_inserted} updated=${batch.rows_updated} skipped=${batch.rows_skipped}`,
    );

    // 跑归因 job 直到处理完
    let totalAttributed = 0;
    for (;;) {
      const r = await runAttributionJob({ batch_id: batch.id, max_rows: 1000 });
      if (r.processed === 0) break;
      totalAttributed += r.processed;
      console.error(`  归因进度: +${r.processed}（累计 ${totalAttributed}）`);
    }
    console.error(`  归因完成，共 ${totalAttributed} 行`);
  }

  console.error("\n=== 完成 ===");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
