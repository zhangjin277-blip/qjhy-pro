// src/scripts/migrate-pro3-accounts.ts
import { runMigration } from "@/modules/live-account/migration";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

interface CliArgs {
  pro3Db: string;
  dryRun: boolean;
  outputReport: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pro3-db") args.pro3Db = argv[++i];
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--output") args.outputReport = argv[++i];
  }
  if (!args.pro3Db)
    throw new Error("usage: migrate-pro3-accounts --pro3-db <path> [--dry-run] [--output <file>]");
  return {
    pro3Db: args.pro3Db,
    dryRun: args.dryRun ?? false,
    outputReport:
      args.outputReport ??
      resolve(`migration-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[migrate] PRO3 SQLite: ${args.pro3Db}`);
  console.log(`[migrate] dry-run: ${args.dryRun}`);

  const report = await runMigration({ pro3SqlitePath: args.pro3Db, dryRun: args.dryRun });

  await writeFile(args.outputReport, JSON.stringify(report, null, 2));

  console.log("");
  console.log(`[migrate] 总行数 ${report.totalRows}`);
  console.log("[migrate] 平台分布", report.platformCounts);
  console.log("[migrate] 产品分布", report.productCounts);
  console.log(`[migrate] rooms 创建: ${report.rooms.created}`);
  console.log(`[migrate] accounts 创建: ${report.accounts.created}`);
  console.log(
    `[migrate] anchors 匹配: ${report.anchors.matched.length} / 待确认: ${report.anchors.pending.length} / 未匹配: ${report.anchors.unmatched.length}`,
  );
  console.log(`[migrate] bindings 创建: ${report.bindings.created}`);
  console.log(`[migrate] errors: ${report.errors.length}`);
  console.log(`[migrate] 详细报告写入: ${args.outputReport}`);

  if (args.dryRun) {
    console.log("[migrate] *** dry-run 模式：未写库 ***");
  }
}

main().catch((e) => {
  console.error("[migrate] 失败:", e);
  process.exit(1);
});
