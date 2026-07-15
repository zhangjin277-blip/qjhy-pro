"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  upsertRoleDefault,
  MODULE_KEYS,
  MODULE_LABEL,
  MODULE_POINTS,
  type ModuleKey,
  type Scope,
} from "@/modules/permissions";
import { PointMatrix, emptyPointMatrix, type PointMatrixValue } from "./point-matrix";

interface RoleRow {
  position: string;
  module: ModuleKey;
  scope: Scope;
  points: string[];
  description: string | null;
}

interface PositionGroup {
  position: string;
  description: string | null;
  modules: PointMatrixValue;
}

const SCOPE_LABEL: Record<Scope, string> = {
  none: "无权限",
  self: "仅本人",
  team: "本部门",
  all: "全部",
};

const SCOPE_TAG_CLASS: Record<Scope, string> = {
  none: "bg-muted/40 text-muted-foreground border-muted-foreground/20",
  self: "bg-sky-50 text-sky-700 border-sky-200",
  team: "bg-violet-50 text-violet-700 border-violet-200",
  all: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function ScopeCell({
  enabled,
  scope,
  pointCount,
}: {
  enabled: boolean;
  scope?: Scope;
  pointCount?: number;
}) {
  if (!enabled || !scope) return <span className="text-muted-foreground/40">—</span>;
  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      <span
        className={`inline-flex h-5 items-center rounded border px-1.5 text-[11px] font-medium ${SCOPE_TAG_CLASS[scope]}`}
      >
        {SCOPE_LABEL[scope]}
      </span>
      {pointCount !== undefined && pointCount > 0 && (
        <span className="text-[10px] text-muted-foreground">{pointCount} 点</span>
      )}
    </span>
  );
}

export function RoleDefaultsTab() {
  const [rows, setRows] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [isExisting, setIsExisting] = useState(false);
  const [editingPosition, setEditingPosition] = useState("");
  const [editingDescription, setEditingDescription] = useState("");
  const [editingModules, setEditingModules] = useState<PointMatrixValue>(emptyPointMatrix());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/roles")
      .then((r) => r.json())
      .then((data: { roles: RoleRow[] }) => {
        setRows(data.roles);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // 聚合：按 position 合并成组
  const groups = useMemo<PositionGroup[]>(() => {
    const map = new Map<string, PositionGroup>();
    for (const r of rows) {
      let g = map.get(r.position);
      if (!g) {
        g = { position: r.position, description: r.description, modules: emptyPointMatrix() };
        map.set(r.position, g);
      }
      g.modules[r.module] = { enabled: true, scope: r.scope, points: r.points ?? [] };
      if (!g.description && r.description) g.description = r.description;
    }
    return Array.from(map.values()).sort((a, b) => a.position.localeCompare(b.position, "zh-CN"));
  }, [rows]);

  function startEdit(g: PositionGroup | null) {
    if (g) {
      setEditingPosition(g.position);
      setEditingDescription(g.description ?? "");
      // 深拷贝防止编辑中污染列表
      const cloned = emptyPointMatrix();
      for (const m of MODULE_KEYS)
        cloned[m] = { ...g.modules[m], points: [...g.modules[m].points] };
      setEditingModules(cloned);
      setIsExisting(true);
    } else {
      setEditingPosition("");
      setEditingDescription("");
      setEditingModules(emptyPointMatrix(true));
      setIsExisting(false);
    }
    setOpen(true);
  }

  async function handleSave() {
    if (!editingPosition.trim()) {
      alert("岗位名称必填");
      return;
    }
    const enabledModules = MODULE_KEYS.filter((m) => editingModules[m].enabled);
    if (enabledModules.length === 0) {
      alert("至少启用一个板块");
      return;
    }
    setSaving(true);
    try {
      for (const m of enabledModules) {
        const c = editingModules[m];
        // 只保留注册表内的点（防陈旧 key 残留）
        const valid = new Set(MODULE_POINTS[m].map((p) => p.key));
        await upsertRoleDefault({
          position: editingPosition,
          module: m,
          scope: c.scope,
          points: c.points.filter((k) => valid.has(k)),
          description: editingDescription || undefined,
        });
      }
      setOpen(false);
      location.reload();
    } catch (e) {
      alert("保存失败：" + (e instanceof Error ? e.message : "未知错误"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-4 text-muted-foreground">加载中...</div>;

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          编辑岗位默认权限：每板块一个数据范围 + 按权限点勾选。带
          <span className="mx-1 rounded bg-red-50 px-1 text-[11px] font-semibold text-red-600">
            敏
          </span>
          标的是敏感操作（删除 / 审批类），按需最小开放。
        </p>
        <Button onClick={() => startEdit(null)}>添加新岗位</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">岗位</TableHead>
            {MODULE_KEYS.map((m) => (
              <TableHead key={m} className="text-center">
                {MODULE_LABEL[m]}
              </TableHead>
            ))}
            <TableHead>说明</TableHead>
            <TableHead className="text-right w-20">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((g) => (
            <TableRow key={g.position}>
              <TableCell className="font-medium">{g.position}</TableCell>
              {MODULE_KEYS.map((m) => {
                const c = g.modules[m];
                return (
                  <TableCell key={m} className="text-center">
                    <ScopeCell enabled={c.enabled} scope={c.scope} pointCount={c.points.length} />
                  </TableCell>
                );
              })}
              <TableCell className="text-muted-foreground text-xs">{g.description}</TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="ghost" onClick={() => startEdit(g)}>
                  编辑
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{isExisting ? `编辑岗位：${editingPosition}` : "添加新岗位"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>岗位名称</Label>
                <Input
                  value={editingPosition}
                  onChange={(e) => setEditingPosition(e.target.value)}
                  disabled={isExisting}
                  placeholder="例如：剪辑、客服"
                />
              </div>
              <div>
                <Label>说明（可选）</Label>
                <Input
                  value={editingDescription}
                  onChange={(e) => setEditingDescription(e.target.value)}
                  placeholder="该岗位的职责描述"
                />
              </div>
            </div>

            <PointMatrix
              value={editingModules}
              onChange={setEditingModules}
              disabledHint="取消勾选板块前的复选框后，该板块下不会写入此岗位的默认权限。"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
