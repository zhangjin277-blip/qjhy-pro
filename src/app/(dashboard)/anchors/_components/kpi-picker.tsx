"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ALL_COLUMNS, ALL_GROUPS, type ColumnDef } from "./column-presets";
import { cn } from "@/lib/utils/cn";

type ColKey = (typeof ALL_COLUMNS)[number]["key"];

interface KpiPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 已经在 KPI 卡片里的 key，列表里 disabled */
  excluded: ColKey[];
  onAdd: (keys: ColKey[]) => void;
  onReset: () => void;
}

/** 弹窗：从所有数值列里多选要加进 KPI 的指标 */
export function KpiPicker({
  open,
  onOpenChange,
  excluded,
  onAdd,
  onReset,
}: KpiPickerProps): React.JSX.Element {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<ColKey>>(new Set());
  const excludedSet = useMemo(() => new Set(excluded), [excluded]);

  const visible = useMemo(() => {
    const s = search.trim().toLowerCase();
    return ALL_COLUMNS.filter((c) => {
      if (c.fmt !== "number" && c.fmt !== "duration" && c.fmt !== "percent") return false;
      if (s && !c.label.toLowerCase().includes(s) && !c.key.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [search]);

  const groups = useMemo(() => {
    const map = new Map<string, ColumnDef[]>();
    for (const c of visible) {
      const list = map.get(c.group) ?? [];
      list.push(c);
      map.set(c.group, list);
    }
    return ALL_GROUPS.filter((g) => map.has(g)).map((g) => ({ group: g, cols: map.get(g) ?? [] }));
  }, [visible]);

  function toggle(key: ColKey): void {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  function confirm(): void {
    const keys = Array.from(picked);
    if (keys.length > 0) onAdd(keys);
    setPicked(new Set());
    setSearch("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>添加 KPI 指标</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="搜索指标..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2"
        />
        <div className="max-h-[480px] overflow-y-auto space-y-3 pr-1">
          {groups.map(({ group, cols }) => (
            <div key={group}>
              <div className="text-xs text-muted-foreground mb-1">{group}</div>
              <div className="grid grid-cols-3 gap-1">
                {cols.map((c) => {
                  const inUse = excludedSet.has(c.key as ColKey);
                  const isPicked = picked.has(c.key as ColKey);
                  return (
                    <label
                      key={c.key}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer",
                        inUse && "opacity-40 cursor-not-allowed",
                        !inUse && isPicked && "bg-primary/10 text-primary",
                        !inUse && !isPicked && "hover:bg-muted",
                      )}
                    >
                      <input
                        type="checkbox"
                        disabled={inUse}
                        checked={isPicked}
                        onChange={() => toggle(c.key as ColKey)}
                        className="size-3.5 accent-primary"
                      />
                      <span className="truncate">{c.label}</span>
                      {inUse && <span className="text-xs text-muted-foreground">已添加</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={onReset}>
            重置为预设默认
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button size="sm" onClick={confirm} disabled={picked.size === 0}>
              添加 {picked.size > 0 ? `(${picked.size})` : ""}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
