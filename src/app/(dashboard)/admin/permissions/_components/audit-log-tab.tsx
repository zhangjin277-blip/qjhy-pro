"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface LogRow {
  id: number;
  user_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  before: unknown;
  after: unknown;
  created_at: string;
}

const HIGHLIGHT_ACTIONS = new Set(["EMERGENCY_LOGIN", "DINGTALK_SYNC_FAILED"]);

export function AuditLogTab() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/audit?limit=200")
      .then((r) => r.json())
      .then((data: { logs: LogRow[] }) => {
        setLogs(data.logs);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-4 text-muted-foreground">加载中...</div>;

  return (
    <div className="space-y-2 mt-4">
      <p className="text-sm text-muted-foreground">最近 {logs.length} 条操作记录（按时间倒序）</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>时间</TableHead>
            <TableHead>操作人</TableHead>
            <TableHead>动作</TableHead>
            <TableHead>对象</TableHead>
            <TableHead>变更内容</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                暂无审计记录
              </TableCell>
            </TableRow>
          ) : (
            logs.map((l) => (
              <TableRow
                key={l.id}
                className={
                  HIGHLIGHT_ACTIONS.has(l.action) ? "bg-amber-50 dark:bg-amber-950/30" : ""
                }
              >
                <TableCell className="text-xs whitespace-nowrap">
                  {new Date(l.created_at).toLocaleString("zh-CN")}
                </TableCell>
                <TableCell>
                  {l.user_id ?? <span className="text-muted-foreground">system</span>}
                </TableCell>
                <TableCell className="font-mono text-xs">{l.action}</TableCell>
                <TableCell>
                  {l.target_type ? (
                    <span className="text-xs">
                      {l.target_type}:<code>{l.target_id}</code>
                    </span>
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                  {l.after ? JSON.stringify(l.after) : "-"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
