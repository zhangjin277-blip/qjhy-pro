"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { exportPlacementTimeRange } from "../actions";
import type { TimeRangeSelection } from "@/modules/placement";

interface Props {
  request: Omit<TimeRangeSelection, "page"> & {
    date_from: string;
    date_to: string;
    dataset_ids?: string[];
  };
  filename: string;
  columns: { key: string; label: string }[];
}

function escapeCsv(value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function TimeRangeExportButton({ request, filename, columns }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const rows = await exportPlacementTimeRange(request);
      const csvRows = rows.map((row) => ({
        ...row,
        time_range: `${String(row.hour).padStart(2, "0")}:00-${String(row.hour + 1).padStart(2, "0")}:00`,
      })) as unknown as Record<string, unknown>[];
      const csv =
        "﻿" +
        columns.map((column) => escapeCsv(column.label)).join(",") +
        "\n" +
        csvRows
          .map((row) => columns.map((column) => escapeCsv(row[column.key])).join(","))
          .join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={handleExport} disabled={loading}>
      {loading ? "导出中..." : "导出筛选数据"}
    </Button>
  );
}
