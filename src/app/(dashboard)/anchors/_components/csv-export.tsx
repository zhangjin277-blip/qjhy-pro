"use client";

import { Button } from "@/components/ui/button";
import type { AnchorListRow } from "@/modules/anchors";

export function CsvExportButton({ rows }: { rows: AnchorListRow[] }): React.JSX.Element {
  function download(): void {
    const headers = [
      "昵称",
      "项目",
      "运营经纪人",
      "健康分",
      "音浪",
      "时长(h)",
      "小游戏分账",
      "推广游戏分账",
    ];
    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.nick_name,
          r.is_threekingdoms ? "三国" : "斗地主",
          r.broker_name ?? "",
          r.anchor_health_score ?? "",
          r.total_fan_ticket ?? "",
          r.live_duration_1d ?? "",
          r.minigame_income ?? "",
          r.game_income ?? "",
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      );
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
