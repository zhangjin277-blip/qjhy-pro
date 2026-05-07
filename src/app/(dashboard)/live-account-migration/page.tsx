import { runMigration } from "@/modules/live-account/server";
import { MigrationClient } from "./_components/migration-client";

export const dynamic = "force-dynamic";

const PRO3_DB = "/Users/zhangjin/miracle-pro3/server/database.sqlite";

export default async function MigrationPage() {
  let report;
  let error: string | null = null;
  try {
    report = await runMigration({ pro3SqlitePath: PRO3_DB, dryRun: true });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="min-w-0 max-w-full space-y-3 px-1 py-1 md:px-1.5 md:py-1.5">
      <div className="flex items-center gap-1 border-b border-slate-200 pb-1">
        <span className="mr-2 px-3 py-1.5 text-sm font-semibold text-slate-700">PRO3 数据迁移</span>
        <span className="ml-auto px-3 text-xs text-slate-400">
          分析 PRO3 SQLite 中的账号数据，确认姓名匹配后实际写入新库
        </span>
      </div>
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="font-bold">迁移分析失败</div>
          <div className="mt-1">{error}</div>
          <div className="mt-2 text-xs text-red-600">PRO3 SQLite 路径：{PRO3_DB}</div>
        </div>
      ) : report ? (
        <MigrationClient report={report} pro3DbPath={PRO3_DB} />
      ) : null}
    </div>
  );
}
