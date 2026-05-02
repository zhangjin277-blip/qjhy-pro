"use client";

import { Button } from "@/components/ui/button";
import type { AnchorListRow } from "@/modules/anchors";
import type { ColumnDef } from "./column-presets";

interface CsvExportButtonProps {
  rows: AnchorListRow[];
  visibleColumns: ColumnDef[];
}

export function CsvExportButton({ rows, visibleColumns }: CsvExportButtonProps): React.JSX.Element {
  function download(): void {
    const headers = visibleColumns.map((c) => c.label);
    const lines = [headers.join(",")];
    for (const r of rows) {
      const cells = visibleColumns.map((c) => {
        let v: unknown;
        if (c.key === "project") {
          v = r.is_threekingdoms ? "三国" : "斗地主";
        } else {
          v = r[c.key as keyof AnchorListRow];
          if (typeof v === "boolean") v = v ? 1 : 0;
        }
        return `"${String(v ?? "").replace(/"/g, '""')}"`;
      });
      lines.push(cells.join(","));
    }
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `anchors-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button size="sm" variant="outline" onClick={download} disabled={rows.length === 0}>
      导出 CSV
    </Button>
  );
}
