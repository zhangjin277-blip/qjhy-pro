"use client";

import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ALL_COLUMNS, ALL_GROUPS, getColumnsByGroup, type ColumnDef } from "./column-presets";
import { cn } from "@/lib/utils/cn";

type ColKey = (typeof ALL_COLUMNS)[number]["key"];

interface ColumnCustomizerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 当前已选列的 key 列表（保持顺序） */
  selectedKeys: ColKey[];
  onConfirm: (keys: ColKey[]) => void;
}

/**
 * 三栏自定义列弹窗。
 *
 * 左栏：分组导航（点击切换中栏内容）
 * 中栏：当前分组所有指标（复选框 + 搜索）
 * 右栏：已选列有序列表（ChevronUp/Down 上下移动，X 移除）
 */
export function ColumnCustomizer({
  open,
  onOpenChange,
  selectedKeys,
  onConfirm,
}: ColumnCustomizerProps): React.JSX.Element {
  // 工作副本，确认时才回传
  const [working, setWorking] = useState<ColKey[]>(() => [...selectedKeys]);
  const [activeGroup, setActiveGroup] = useState<string>(ALL_GROUPS[0]);
  const [search, setSearch] = useState("");

  // 每次打开重置工作副本
  function handleOpenChange(v: boolean): void {
    if (v) {
      setWorking([...selectedKeys]);
      setSearch("");
      setActiveGroup(ALL_GROUPS[0]);
    }
    onOpenChange(v);
  }

  const workingSet = useMemo(() => new Set(working), [working]);

  // 中栏：当前分组的列（可搜索）
  const midColumns = useMemo<ColumnDef[]>(() => {
    const groupCols = getColumnsByGroup(activeGroup);
    if (!search.trim()) return groupCols;
    const q = search.trim().toLowerCase();
    return groupCols.filter(
      (c) => c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q),
    );
  }, [activeGroup, search]);

  // 左栏：分组 + 已选计数
  const groupCounts = useMemo(() => {
    const map: Record<string, { selected: number; total: number }> = {};
    for (const g of ALL_GROUPS) {
      const cols = getColumnsByGroup(g);
      map[g] = {
        total: cols.length,
        selected: cols.filter((c) => workingSet.has(c.key)).length,
      };
    }
    return map;
  }, [workingSet]);

  function toggleKey(key: ColKey): void {
    if (workingSet.has(key)) {
      setWorking((prev) => prev.filter((k) => k !== key));
    } else {
      setWorking((prev) => [...prev, key]);
    }
  }

  function toggleAll(keys: ColKey[]): void {
    const allSelected = keys.every((k) => workingSet.has(k));
    if (allSelected) {
      setWorking((prev) => prev.filter((k) => !keys.includes(k)));
    } else {
      const toAdd = keys.filter((k) => !workingSet.has(k));
      setWorking((prev) => [...prev, ...toAdd]);
    }
  }

  function moveUp(idx: number): void {
    if (idx <= 0) return;
    setWorking((prev) => {
      const next = [...prev] as ColKey[];
      const tmp = next[idx - 1] as ColKey;
      next[idx - 1] = next[idx] as ColKey;
      next[idx] = tmp;
      return next;
    });
  }

  function moveDown(idx: number): void {
    setWorking((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev] as ColKey[];
      const tmp = next[idx] as ColKey;
      next[idx] = next[idx + 1] as ColKey;
      next[idx + 1] = tmp;
      return next;
    });
  }

  function removeKey(key: ColKey): void {
    setWorking((prev) => prev.filter((k) => k !== key));
  }

  function handleConfirm(): void {
    onConfirm(working);
    onOpenChange(false);
  }

  // 右栏：按顺序展示已选列的 label
  const labelMap = useMemo(() => new Map(ALL_COLUMNS.map((c) => [c.key, c.label])), []);

  const midAllKeys = midColumns.map((c) => c.key);
  const allMidSelected = midAllKeys.length > 0 && midAllKeys.every((k) => workingSet.has(k));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-3 border-b">
          <DialogTitle className="text-base font-semibold">自定义列</DialogTitle>
        </DialogHeader>

        <div className="flex h-[500px] overflow-hidden">
          {/* 左栏：分组导航 */}
          <div className="w-36 shrink-0 border-r overflow-y-auto bg-muted/30">
            {ALL_GROUPS.map((g) => {
              const cnt = groupCounts[g] ?? { selected: 0, total: 0 };
              const isActive = activeGroup === g;
              return (
                <button
                  key={g}
                  onClick={() => {
                    setActiveGroup(g);
                    setSearch("");
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2.5 text-sm transition-colors",
                    "flex items-center justify-between gap-1",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-muted/60 text-foreground",
                  )}
                >
                  <span className="truncate">{g}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {cnt.selected}/{cnt.total}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 中栏：指标列表 */}
          <div className="flex-1 flex flex-col overflow-hidden border-r">
            <div className="px-3 py-2 border-b shrink-0">
              <Input
                placeholder="搜索指标..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="overflow-y-auto flex-1 py-1">
              {/* 全选行 */}
              {!search && midAllKeys.length > 0 && (
                <label className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 border-b text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={allMidSelected}
                    onChange={() => toggleAll(midAllKeys)}
                    className="accent-primary"
                  />
                  <span>全选 ({midAllKeys.length})</span>
                </label>
              )}
              {midColumns.map((c) => {
                const checked = workingSet.has(c.key);
                return (
                  <label
                    key={c.key}
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleKey(c.key)}
                      className="accent-primary"
                    />
                    <span>{c.label}</span>
                  </label>
                );
              })}
              {midColumns.length === 0 && (
                <p className="text-muted-foreground text-sm px-3 py-4 text-center">无匹配指标</p>
              )}
            </div>
          </div>

          {/* 右栏：已选列（有序） */}
          <div className="w-52 shrink-0 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b shrink-0 text-sm font-medium text-muted-foreground">
              已选 {working.length} 列
            </div>
            <div className="overflow-y-auto flex-1 py-1">
              {working.map((key, idx) => (
                <div
                  key={key}
                  className="flex items-center gap-1 px-2 py-1.5 hover:bg-muted/50 text-sm group"
                >
                  <span className="flex-1 truncate">{labelMap.get(key) ?? key}</span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => moveUp(idx)}
                      disabled={idx === 0}
                      className="p-0.5 rounded hover:bg-muted disabled:opacity-20"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => moveDown(idx)}
                      disabled={idx === working.length - 1}
                      className="p-0.5 rounded hover:bg-muted disabled:opacity-20"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => removeKey(key)}
                      className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {working.length === 0 && (
                <p className="text-muted-foreground text-sm px-3 py-4 text-center">未选任何列</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t">
          <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
            取消
          </Button>
          <Button size="sm" onClick={handleConfirm}>
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
