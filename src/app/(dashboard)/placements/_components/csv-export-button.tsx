"use client";

import { Button } from "@/components/ui/button";

interface CsvExportButtonProps {
  rows: Record<string, unknown>[];
  filename: string;
  columns: { key: string; label: string }[];
  label?: string;
}

function escapeCsv(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function CsvExportButton({
  rows,
  filename,
  columns,
  label = "导出 CSV",
}: CsvExportButtonProps) {
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
    <Button size="sm" variant="outline" onClick={handleClick} disabled={rows.length === 0}>
      {label}
    </Button>
  );
}
