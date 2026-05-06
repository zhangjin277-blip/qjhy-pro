"use client";

interface CsvExportButtonProps {
  rows: Record<string, unknown>[];
  filename: string;
  columns: { key: string; label: string }[];
}

function escapeCsv(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function CsvExportButton({ rows, filename, columns }: CsvExportButtonProps) {
  const handleClick = () => {
    const header = columns.map((c) => escapeCsv(c.label)).join(",");
    const body = rows.map((r) => columns.map((c) => escapeCsv(r[c.key])).join(",")).join("\n");
    const csv = "﻿" + header + "\n" + body; // BOM for Excel
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleClick}
      className="rounded border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
    >
      ⬇ 导出 CSV
    </button>
  );
}
