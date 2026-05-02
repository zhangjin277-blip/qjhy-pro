"use client";

import { useEffect, useState } from "react";
import { Filters } from "./filters";
import { CsvExportButton } from "./csv-export";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AnchorListRow, AnchorListFilters } from "@/modules/anchors";

const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

export function AnchorTable(): React.JSX.Element {
  const [filters, setFilters] = useState<AnchorListFilters>({ date: yesterday, project: "all" });
  const [rows, setRows] = useState<AnchorListRow[]>([]);

  useEffect(() => {
    const sp = new URLSearchParams();
    sp.set("date", filters.date);
    if (filters.project) sp.set("project", filters.project);
    if (filters.search) sp.set("search", filters.search);
    fetch(`/api/anchors?${sp.toString()}`)
      .then((r) => r.json() as Promise<{ rows: AnchorListRow[] }>)
      .then((d) => setRows(d.rows));
  }, [filters]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Filters filters={filters} onChange={setFilters} />
        <CsvExportButton rows={rows} />
      </div>
      <div className="bg-card rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>昵称</TableHead>
              <TableHead>项目</TableHead>
              <TableHead>运营经纪人</TableHead>
              <TableHead>健康分</TableHead>
              <TableHead className="text-right">音浪</TableHead>
              <TableHead className="text-right">时长</TableHead>
              <TableHead className="text-right">小游戏分账</TableHead>
              <TableHead className="text-right">推广游戏分账</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.anchor_id}>
                <TableCell>{r.nick_name}</TableCell>
                <TableCell>{r.is_threekingdoms ? "三国" : "斗地主"}</TableCell>
                <TableCell>{r.broker_name ?? "—"}</TableCell>
                <TableCell>{r.anchor_health_score ?? "—"}</TableCell>
                <TableCell className="text-right">{fmt(r.total_fan_ticket)}</TableCell>
                <TableCell className="text-right">
                  {r.live_duration_1d !== null ? `${r.live_duration_1d}h` : "—"}
                </TableCell>
                <TableCell className="text-right">{fmt(r.minigame_income)}</TableCell>
                <TableCell className="text-right">{fmt(r.game_income)}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                  无数据
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function fmt(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("zh-CN");
}
