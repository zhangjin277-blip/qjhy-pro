"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { upsertAlias, deleteAlias } from "@/modules/aliases";

interface DeptRow {
  dept_id: string;
  name: string;
  parent_id: string | null;
  alias: string | null;
  note: string | null;
}

export function DeptAliasesTab() {
  const [depts, setDepts] = useState<DeptRow[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DeptRow | null>(null);
  const [aliasInput, setAliasInput] = useState("");
  const [noteInput, setNoteInput] = useState("");

  useEffect(() => {
    fetch("/api/admin/depts")
      .then((r) => r.json() as Promise<{ depts: DeptRow[] }>)
      .then((d) => {
        setDepts(d.depts);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-muted-foreground p-4">加载中...</div>;

  function startEdit(d: DeptRow) {
    setEditing(d);
    setAliasInput(d.alias ?? "");
    setNoteInput(d.note ?? "");
  }

  async function handleSave() {
    if (!editing) return;
    const trimmed = aliasInput.trim();
    if (!trimmed) {
      // 空字符串 → 删除别名（恢复原名显示）
      if (editing.alias) {
        if (!confirm(`确认清除 "${editing.name}" 的别名？将恢复显示原名。`)) return;
        try {
          await deleteAlias({ entity_type: "dept", entity_id: editing.dept_id });
          setEditing(null);
          location.reload();
        } catch (e) {
          alert("删除失败：" + (e instanceof Error ? e.message : "未知错误"));
        }
      } else {
        setEditing(null);
      }
      return;
    }
    try {
      await upsertAlias({
        entity_type: "dept",
        entity_id: editing.dept_id,
        alias: trimmed,
        note: noteInput.trim() || undefined,
      });
      setEditing(null);
      location.reload();
    } catch (e) {
      alert("保存失败：" + (e instanceof Error ? e.message : "未知错误"));
    }
  }

  const q = filter.toLowerCase();
  const filtered = depts.filter(
    (d) =>
      !q ||
      d.name.toLowerCase().includes(q) ||
      (d.alias?.toLowerCase().includes(q) ?? false) ||
      d.dept_id.includes(q),
  );

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          自定义部门显示名称。<strong>钉钉同步不会覆盖别名</strong>
          ，原名会作为 hover 提示保留。
        </p>
        <Input
          placeholder="搜索部门名/别名/ID..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <div className="bg-card rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>原名（钉钉）</TableHead>
              <TableHead>别名</TableHead>
              <TableHead>备注</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((d) => (
              <TableRow key={d.dept_id}>
                <TableCell>
                  <div className="text-sm font-medium">{d.name}</div>
                  <div className="text-muted-foreground text-xs">ID {d.dept_id}</div>
                </TableCell>
                <TableCell>
                  {d.alias ? (
                    <span className="text-primary text-sm">{d.alias}</span>
                  ) : (
                    <span className="text-muted-foreground/60 text-xs">—</span>
                  )}
                </TableCell>
                <TableCell className="max-w-xs">
                  {d.note ? (
                    <span className="text-muted-foreground text-xs">{d.note}</span>
                  ) : (
                    <span className="text-muted-foreground/60 text-xs">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(d)}>
                    {d.alias ? "编辑" : "设置别名"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground text-center text-sm">
                  无匹配部门
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>设置别名：{editing?.name}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>别名（留空则清除别名，恢复原名）</Label>
                <Input
                  value={aliasInput}
                  onChange={(e) => setAliasInput(e.target.value)}
                  placeholder="例如：内容创意中心"
                  autoFocus
                />
              </div>
              <div>
                <Label>备注（可选，鼠标 hover 显示）</Label>
                <Input
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="例如：原 孵化组，2026/04 改名"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
