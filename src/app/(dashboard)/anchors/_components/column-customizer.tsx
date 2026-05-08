"use client";

import { useState, useMemo, useEffect } from "react";
import { GripVertical, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ALL_COLUMNS as DEFAULT_ALL_COLUMNS,
  ALL_GROUPS as DEFAULT_ALL_GROUPS,
  getColumnsByGroup as defaultGetColumnsByGroup,
  getColumnsBySubGroup as defaultGetColumnsBySubGroup,
  type ColumnDef,
} from "./column-presets";
import { cn } from "@/lib/utils/cn";

interface ColumnCustomizerProps<TKey extends string = string> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 当前已选列的 key 列表（保持顺序） */
  selectedKeys: TKey[];
  onConfirm: (keys: TKey[]) => void;
  /** 当前激活的用户预设名（非 null 时显示「更新预设」按钮）*/
  activeUserPresetName?: string | null;
  /** 用工作副本更新当前用户预设 */
  onUpdatePreset?: (keys: TKey[]) => Promise<void> | void;
  /** 用工作副本另存为新预设 */
  onSaveAsNewPreset?: (keys: TKey[]) => Promise<void> | void;
  /** 全部候选列（默认抖音的 ALL_COLUMNS）。快手等其他平台传自己的列 */
  allColumns?: ColumnDef<TKey>[];
  /** 分组左栏顺序（默认抖音的 ALL_GROUPS） */
  groups?: string[];
  /** 给定分组返回所有列（默认抖音 fn） */
  getColumnsByGroup?: (group: string) => ColumnDef<TKey>[];
  /** 给定分组返回 subGroup 切块（默认抖音 fn） */
  getColumnsBySubGroup?: (
    group: string,
  ) => { subGroup: string | null; columns: ColumnDef<TKey>[] }[];
}

/**
 * 三栏自定义列弹窗。
 *
 * 左栏：分组导航（点击切换中栏内容）
 * 中栏：当前分组所有指标（复选框 + 搜索）
 * 右栏：已选列有序列表（ChevronUp/Down 上下移动，X 移除）
 */
export function ColumnCustomizer<TKey extends string = string>({
  open,
  onOpenChange,
  selectedKeys,
  onConfirm,
  activeUserPresetName,
  onUpdatePreset,
  onSaveAsNewPreset,
  allColumns = DEFAULT_ALL_COLUMNS as unknown as ColumnDef<TKey>[],
  groups = [...DEFAULT_ALL_GROUPS],
  getColumnsByGroup = defaultGetColumnsByGroup as unknown as (g: string) => ColumnDef<TKey>[],
  getColumnsBySubGroup = defaultGetColumnsBySubGroup as unknown as (
    g: string,
  ) => { subGroup: string | null; columns: ColumnDef<TKey>[] }[],
}: ColumnCustomizerProps<TKey>): React.JSX.Element {
  // 工作副本，确认时才回传
  const [working, setWorking] = useState<TKey[]>(() => [...selectedKeys]);
  const [activeGroup, setActiveGroup] = useState<string>(groups[0] ?? "");
  const [search, setSearch] = useState("");

  // 每次打开重置工作副本（含父组件主动 open 的场景，handleOpenChange 不会触发）
  useEffect(() => {
    if (open) {
      setWorking([...selectedKeys]);
      setSearch("");
      setActiveGroup(groups[0] ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleOpenChange(v: boolean): void {
    onOpenChange(v);
  }

  const workingSet = useMemo(() => new Set(working), [working]);

  // 中栏：当前分组的列（可搜索）
  const midColumns = useMemo<ColumnDef<TKey>[]>(() => {
    const groupCols = getColumnsByGroup(activeGroup);
    if (!search.trim()) return groupCols;
    const q = search.trim().toLowerCase();
    return groupCols.filter(
      (c) => c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q),
    );
  }, [activeGroup, search, getColumnsByGroup]);

  // 按 subGroup 切块（仅在无搜索时分块；搜索时扁平展示）
  const midBlocks = useMemo(() => {
    if (search.trim()) return null;
    return getColumnsBySubGroup(activeGroup);
  }, [activeGroup, search, getColumnsBySubGroup]);

  // 左栏：分组 + 已选计数
  const groupCounts = useMemo(() => {
    const map: Record<string, { selected: number; total: number }> = {};
    for (const g of groups) {
      const cols = getColumnsByGroup(g);
      map[g] = {
        total: cols.length,
        selected: cols.filter((c) => workingSet.has(c.key)).length,
      };
    }
    return map;
  }, [workingSet, groups, getColumnsByGroup]);

  function toggleKey(key: TKey): void {
    if (workingSet.has(key)) {
      setWorking((prev) => prev.filter((k) => k !== key));
    } else {
      setWorking((prev) => [...prev, key]);
    }
  }

  function toggleAll(keys: TKey[]): void {
    const allSelected = keys.every((k) => workingSet.has(k));
    if (allSelected) {
      setWorking((prev) => prev.filter((k) => !keys.includes(k)));
    } else {
      const toAdd = keys.filter((k) => !workingSet.has(k));
      setWorking((prev) => [...prev, ...toAdd]);
    }
  }

  // 拖拽排序状态
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  function reorder(from: number, to: number): void {
    if (from === to) return;
    setWorking((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      if (!moved) return prev;
      next.splice(to, 0, moved);
      return next;
    });
  }

  function removeKey(key: TKey): void {
    setWorking((prev) => prev.filter((k) => k !== key));
  }

  function handleConfirm(): void {
    onConfirm(working);
    onOpenChange(false);
  }

  // 右栏：按顺序展示已选列的 label
  const labelMap = useMemo(() => new Map(allColumns.map((c) => [c.key, c.label])), [allColumns]);

  const midAllKeys = midColumns.map((c) => c.key);
  const allMidSelected = midAllKeys.length > 0 && midAllKeys.every((k) => workingSet.has(k));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-6xl p-0 gap-0 overflow-hidden sm:max-w-6xl">
        <DialogHeader className="px-5 pt-4 pb-3 border-b">
          <DialogTitle className="text-base font-semibold">自定义列</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-[180px_minmax(420px,1fr)_240px] h-[560px] overflow-hidden">
          {/* 左栏：分组导航 */}
          <div className="border-r overflow-y-auto bg-muted/30">
            {groups.map((g) => {
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
          <div className="flex flex-col overflow-hidden border-r min-w-0">
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
              {midBlocks ? (
                midBlocks.map((block, blockIdx) => (
                  <div key={block.subGroup ?? `_${blockIdx}`}>
                    {block.subGroup && (
                      <div className="px-3 pt-3 pb-1.5 text-xs font-semibold text-muted-foreground bg-muted/20">
                        {block.subGroup}
                      </div>
                    )}
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-2 px-2 py-1">
                      {block.columns.map((c) => {
                        const checked = workingSet.has(c.key);
                        return (
                          <label
                            key={c.key}
                            className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-muted/50 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleKey(c.key)}
                              className="accent-primary shrink-0"
                            />
                            <span className="truncate">{c.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-2 px-2 py-1">
                  {midColumns.map((c) => {
                    const checked = workingSet.has(c.key);
                    return (
                      <label
                        key={c.key}
                        className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-muted/50 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleKey(c.key)}
                          className="accent-primary shrink-0"
                        />
                        <span className="truncate">{c.label}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              {midColumns.length === 0 && (
                <p className="text-muted-foreground text-sm px-3 py-4 text-center">无匹配指标</p>
              )}
            </div>
          </div>

          {/* 右栏：已选列（拖拽排序） */}
          <div className="flex flex-col overflow-hidden min-w-0">
            <div className="px-3 py-2 border-b shrink-0 text-sm font-medium text-muted-foreground">
              已选 {working.length} 列
            </div>
            <div className="overflow-y-auto flex-1 py-1">
              {working.map((key, idx) => (
                <div
                  key={key}
                  draggable
                  onDragStart={(e) => {
                    setDragIdx(idx);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dropIdx !== idx) setDropIdx(idx);
                  }}
                  onDragLeave={() => {
                    if (dropIdx === idx) setDropIdx(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIdx !== null) reorder(dragIdx, idx);
                    setDragIdx(null);
                    setDropIdx(null);
                  }}
                  onDragEnd={() => {
                    setDragIdx(null);
                    setDropIdx(null);
                  }}
                  className={cn(
                    "flex items-center gap-1 px-1 py-1.5 text-sm group cursor-grab active:cursor-grabbing border-t-2 border-b-2 border-transparent",
                    dragIdx === idx && "opacity-40",
                    dropIdx === idx &&
                      dragIdx !== null &&
                      dragIdx !== idx &&
                      (dragIdx > idx ? "border-t-primary" : "border-b-primary"),
                    dragIdx !== idx && "hover:bg-muted/50",
                  )}
                >
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                  <span className="flex-1 truncate select-none">{labelMap.get(key) ?? key}</span>
                  <div className="flex items-center gap-0.5 shrink-0">
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

        <DialogFooter className="px-5 py-3 border-t gap-2">
          <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
            取消
          </Button>
          {onSaveAsNewPreset && (
            <Button
              variant="outline"
              size="sm"
              className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
              onClick={async () => {
                await onSaveAsNewPreset(working);
                onOpenChange(false);
              }}
            >
              {activeUserPresetName ? "另存为新预设" : "保存为预设"}
            </Button>
          )}
          {activeUserPresetName && onUpdatePreset && (
            <Button
              size="sm"
              className="bg-change-down text-white hover:bg-change-down/90"
              onClick={async () => {
                await onUpdatePreset(working);
                onOpenChange(false);
              }}
            >
              更新「{activeUserPresetName}」
            </Button>
          )}
          <Button size="sm" onClick={handleConfirm}>
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
