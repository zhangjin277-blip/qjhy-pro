"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  upsertRoleDefault,
  MODULE_KEYS,
  MODULE_LABEL,
  type ModuleKey,
  type Scope,
} from "@/modules/permissions";

interface RoleRow {
  position: string;
  module: ModuleKey;
  scope: Scope;
  can_edit: boolean;
  can_export: boolean;
  can_admin: boolean;
  description: string | null;
}

/** 每个 module 一组配置（编辑 dialog 用） */
interface ModuleConfig {
  enabled: boolean; // 是否在该 module 上有此岗位的行
  scope: Scope;
  can_edit: boolean;
  can_export: boolean;
  can_admin: boolean;
}

interface PositionGroup {
  position: string;
  description: string | null;
  /** 每个 module 的配置，缺失行 enabled=false */
  modules: Record<ModuleKey, ModuleConfig>;
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

const EMPTY_MODULE_CONFIG: ModuleConfig = {
  enabled: true,
  scope: "none",
  can_edit: false,
  can_export: false,
  can_admin: false,
};

function emptyModules(): Record<ModuleKey, ModuleConfig> {
  return MODULE_KEYS.reduce(
    (acc, m) => {
      acc[m] = { ...EMPTY_MODULE_CONFIG };
      return acc;
    },
    {} as Record<ModuleKey, ModuleConfig>,
  );
}

function ScopeCell({ enabled, scope }: { enabled: boolean; scope?: Scope }) {
  if (!enabled || !scope) return <span className="text-muted-foreground/40">—</span>;
  return (
    <span
      className={`inline-flex h-5 items-center rounded border px-1.5 text-[11px] font-medium ${SCOPE_TAG_CLASS[scope]}`}
    >
      {SCOPE_LABEL[scope]}
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
  const [editingModules, setEditingModules] =
    useState<Record<ModuleKey, ModuleConfig>>(emptyModules());
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

  // 聚合：按 position 合并 4 行成 1 组
  const groups = useMemo<PositionGroup[]>(() => {
    const map = new Map<string, PositionGroup>();
    for (const r of rows) {
      let g = map.get(r.position);
      if (!g) {
        g = { position: r.position, description: r.description, modules: emptyModules() };
        // 默认 enabled=false（缺行）；下面遇到行时再覆盖
        for (const m of MODULE_KEYS) g.modules[m].enabled = false;
        map.set(r.position, g);
      }
      g.modules[r.module] = {
        enabled: true,
        scope: r.scope,
        can_edit: r.can_edit,
        can_export: r.can_export,
        can_admin: r.can_admin,
      };
      // description 取首个非空
      if (!g.description && r.description) g.description = r.description;
    }
    return Array.from(map.values()).sort((a, b) => a.position.localeCompare(b.position, "zh-CN"));
  }, [rows]);

  function startEdit(g: PositionGroup | null) {
    if (g) {
      setEditingPosition(g.position);
      setEditingDescription(g.description ?? "");
      setEditingModules({ ...g.modules });
      setIsExisting(true);
    } else {
      setEditingPosition("");
      setEditingDescription("");
      // 添加新岗位：默认 4 个 module 全启用、无权限
      const init = emptyModules();
      for (const m of MODULE_KEYS) init[m].enabled = true;
      setEditingModules(init);
      setIsExisting(false);
    }
    setOpen(true);
  }

  function setModuleField<K extends keyof ModuleConfig>(
    m: ModuleKey,
    key: K,
    value: ModuleConfig[K],
  ) {
    setEditingModules((prev) => ({
      ...prev,
      [m]: { ...prev[m], [key]: value },
    }));
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
        await upsertRoleDefault({
          position: editingPosition,
          module: m,
          scope: c.scope,
          can_edit: c.can_edit,
          can_export: c.can_export,
          can_admin: c.can_admin,
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
          编辑岗位默认权限。每个岗位在 4
          个板块下分别配置数据范围与子权限。新岗位（如剪辑/客服/技术）可直接添加。
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
                    <ScopeCell enabled={c.enabled} scope={c.scope} />
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
        <DialogContent className="max-w-2xl">
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

            <div>
              <Label>各板块权限配置</Label>
              <div className="mt-2 rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 text-xs text-muted-foreground">
                      <th className="text-left px-3 py-2 w-32">板块</th>
                      <th className="text-left px-3 py-2 w-32">数据范围</th>
                      <th className="text-center px-2 py-2">编辑</th>
                      <th className="text-center px-2 py-2">导出</th>
                      <th className="text-center px-2 py-2">管理</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MODULE_KEYS.map((m) => {
                      const c = editingModules[m];
                      return (
                        <tr key={m} className="border-t">
                          <td className="px-3 py-2">
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <input
                                type="checkbox"
                                checked={c.enabled}
                                onChange={(e) => setModuleField(m, "enabled", e.target.checked)}
                                className="h-4 w-4"
                              />
                              {MODULE_LABEL[m]}
                            </label>
                          </td>
                          <td className="px-3 py-2">
                            <Select
                              value={c.scope}
                              onValueChange={(v) =>
                                setModuleField(m, "scope", (v ?? "none") as Scope)
                              }
                              disabled={!c.enabled}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">无权限</SelectItem>
                                <SelectItem value="self">仅本人</SelectItem>
                                <SelectItem value="team">本部门</SelectItem>
                                <SelectItem value="all">全部</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="text-center px-2 py-2">
                            <input
                              type="checkbox"
                              checked={c.can_edit}
                              onChange={(e) => setModuleField(m, "can_edit", e.target.checked)}
                              disabled={!c.enabled}
                              className="h-4 w-4"
                            />
                          </td>
                          <td className="text-center px-2 py-2">
                            <input
                              type="checkbox"
                              checked={c.can_export}
                              onChange={(e) => setModuleField(m, "can_export", e.target.checked)}
                              disabled={!c.enabled}
                              className="h-4 w-4"
                            />
                          </td>
                          <td className="text-center px-2 py-2">
                            <input
                              type="checkbox"
                              checked={c.can_admin}
                              onChange={(e) => setModuleField(m, "can_admin", e.target.checked)}
                              disabled={!c.enabled}
                              className="h-4 w-4"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                取消勾选板块前的复选框后，该板块下不会写入此岗位的默认权限。
              </p>
            </div>
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
