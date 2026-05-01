"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { upsertRoleDefault, type Scope } from "@/modules/permissions";

interface Role {
  position: string;
  scope: Scope;
  can_edit: boolean;
  can_export: boolean;
  can_admin: boolean;
  description: string | null;
}

const EMPTY_ROLE: Role = {
  position: "",
  scope: "none",
  can_edit: false,
  can_export: false,
  can_admin: false,
  description: null,
};

export function RoleDefaultsTab() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [editing, setEditing] = useState<Role | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isExisting, setIsExisting] = useState(false);

  useEffect(() => {
    fetch("/api/admin/roles")
      .then((r) => r.json())
      .then((data: { roles: Role[] }) => {
        setRoles(data.roles);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-4 text-muted-foreground">加载中...</div>;

  function startEdit(role: Role | null) {
    if (role) {
      setEditing({ ...role });
      setIsExisting(true);
    } else {
      setEditing({ ...EMPTY_ROLE });
      setIsExisting(false);
    }
    setOpen(true);
  }

  async function handleSave() {
    if (!editing) return;
    if (!editing.position.trim()) {
      alert("岗位名称必填");
      return;
    }
    try {
      await upsertRoleDefault({
        position: editing.position,
        scope: editing.scope,
        can_edit: editing.can_edit,
        can_export: editing.can_export,
        can_admin: editing.can_admin,
        description: editing.description ?? undefined,
      });
      setOpen(false);
      setEditing(null);
      location.reload();
    } catch (e) {
      alert("保存失败：" + (e instanceof Error ? e.message : "未知错误"));
    }
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          编辑岗位默认权限。新岗位（如剪辑/客服/技术）可直接添加，无需修改代码。
        </p>
        <Button onClick={() => startEdit(null)}>添加新岗位</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>岗位</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead className="text-center">可编辑</TableHead>
            <TableHead className="text-center">可导出</TableHead>
            <TableHead className="text-center">可管理</TableHead>
            <TableHead>说明</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((r) => (
            <TableRow key={r.position}>
              <TableCell className="font-medium">{r.position}</TableCell>
              <TableCell className="font-mono">{r.scope}</TableCell>
              <TableCell className="text-center">{r.can_edit ? "✓" : ""}</TableCell>
              <TableCell className="text-center">{r.can_export ? "✓" : ""}</TableCell>
              <TableCell className="text-center">{r.can_admin ? "✓" : ""}</TableCell>
              <TableCell className="text-muted-foreground">{r.description}</TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="ghost" onClick={() => startEdit(r)}>
                  编辑
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isExisting && editing ? `编辑：${editing.position}` : "添加新岗位"}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>岗位名称（钉钉里的 title 字段值）</Label>
                <Input
                  value={editing.position}
                  onChange={(e) => setEditing({ ...editing, position: e.target.value })}
                  disabled={isExisting}
                  placeholder="例如：剪辑、客服"
                />
              </div>
              <div>
                <Label>Scope</Label>
                <Select
                  value={editing.scope}
                  onValueChange={(v) => setEditing({ ...editing, scope: v as Scope })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">none</SelectItem>
                    <SelectItem value="self">self</SelectItem>
                    <SelectItem value="team">team</SelectItem>
                    <SelectItem value="all">all</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editing.can_edit}
                    onChange={(e) => setEditing({ ...editing, can_edit: e.target.checked })}
                  />
                  can_edit
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editing.can_export}
                    onChange={(e) => setEditing({ ...editing, can_export: e.target.checked })}
                  />
                  can_export
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editing.can_admin}
                    onChange={(e) => setEditing({ ...editing, can_admin: e.target.checked })}
                  />
                  can_admin
                </label>
              </div>
              <div>
                <Label>说明</Label>
                <Input
                  value={editing.description ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
