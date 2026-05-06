"use client";
import { useState } from "react";

interface DryRunDataset {
  id: string;
  rows: number;
  date_from: string;
  date_to: string;
  account_count: number;
}

interface DryRunReport {
  datasets: DryRunDataset[];
}

export default function PlacementMigrationPage() {
  const [report, setReport] = useState<DryRunReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text) as DryRunReport;
      setReport(json);
      setError(null);
    } catch (e) {
      setError(`解析失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">PRO3 投放迁移 — Dry-Run 报告</h1>
      <p className="text-sm text-slate-600">
        先在终端跑迁移 CLI 的 <code>--dry-run</code> 模式，stdout JSON
        重定向到文件后上传到此处查看。
      </p>
      <input
        type="file"
        accept=".json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>
      )}

      {report && (
        <div className="space-y-3">
          {report.datasets.map((d) => (
            <div key={d.id} className="rounded border border-slate-200 bg-white p-4">
              <h2 className="font-medium">{d.id}</h2>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <dt className="text-slate-500">行数</dt>
                <dd>{d.rows.toLocaleString()}</dd>
                <dt className="text-slate-500">日期范围</dt>
                <dd>
                  {d.date_from} ~ {d.date_to}
                </dd>
                <dt className="text-slate-500">涉及账号</dt>
                <dd>{d.account_count}</dd>
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
