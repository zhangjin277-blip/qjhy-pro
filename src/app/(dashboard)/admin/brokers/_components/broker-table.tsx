"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { setBrokerMapping } from "@/modules/brokers";

interface BrokerRow {
  broker_id: string;
  broker_name: string;
  dingtalk_user_id: string | null;
  user_name: string | null;
  match_source: "auto" | "manual" | "pending";
}

const SOURCE_LABEL: Record<string, string> = {
  auto: "自动匹配",
  manual: "手工设置",
  pending: "未匹配",
};

export function BrokerTable(): React.JSX.Element {
  const [rows, setRows] = useState<BrokerRow[]>([]);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editUserId, setEditUserId] = useState("");

  useEffect(() => {
    fetch("/api/admin/brokers")
      .then((r) => r.json() as Promise<{ brokers: BrokerRow[] }>)
      .then((d) => setRows(d.brokers));
  }, []);

  async function save(brokerId: string): Promise<void> {
    await setBrokerMapping({ broker_id: brokerId, dingtalk_user_id: editUserId });
    setEditing(null);
    location.reload();
  }

  const q = filter.toLowerCase();
  const filtered = rows.filter(
    (r) =>
      !q ||
      r.broker_name.toLowerCase().includes(q) ||
      (r.user_name?.toLowerCase().includes(q) ?? false),
  );

  return (
    <div className="space-y-3">
      <Input
        placeholder="搜索经纪人/钉钉用户..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-xs"
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>经纪人姓名</TableHead>
            <TableHead>钉钉用户</TableHead>
            <TableHead>匹配方式</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((r) => (
            <TableRow key={r.broker_id}>
              <TableCell>{r.broker_name}</TableCell>
              <TableCell>
                {editing === r.broker_id ? (
                  <Input
                    placeholder="user_id"
                    value={editUserId}
                    onChange={(e) => setEditUserId(e.target.value)}
                    className="h-8"
                  />
                ) : (
                  (r.user_name ?? <span className="text-muted-foreground">—</span>)
                )}
              </TableCell>
              <TableCell>{SOURCE_LABEL[r.match_source]}</TableCell>
              <TableCell className="text-right space-x-2">
                {editing === r.broker_id ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      取消
                    </Button>
                    <Button size="sm" onClick={() => save(r.broker_id)}>
                      保存
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(r.broker_id);
                      setEditUserId(r.dingtalk_user_id ?? "");
                    }}
                  >
                    编辑
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
