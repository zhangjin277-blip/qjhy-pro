import { runMigration } from "@/modules/live-account/migration";
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
    <div className="p-6">
      <h1 className="mb-1 text-xl font-bold text-slate-800">PRO3 数据迁移</h1>
      <p className="mb-4 text-sm text-slate-500">
        分析 PRO3 SQLite 中的账号数据，确认姓名匹配后实际写入新库
      </p>
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
