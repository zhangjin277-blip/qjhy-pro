"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AnchorFilters, BrokerOptions, BrokerSelection } from "./platform-config";

const transparentInput =
  "h-8 rounded border border-transparent bg-transparent px-2 text-sm placeholder:text-slate-400 hover:border-slate-200 focus:border-primary focus:bg-white focus:outline-none";

const yesterday = (): string => new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
const daysAgo = (n: number): string =>
  new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);

/** 经纪人多选下拉（搜索 + 全选/清空 + checkbox 列表） */
function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  function toggle(o: string): void {
    onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o]);
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm transition ${
          selected.length > 0
            ? "border-primary bg-blue-50 text-primary"
            : "border-slate-200 bg-white text-slate-600 hover:border-primary hover:text-primary"
        }`}
      >
        <span>{label}</span>
        {selected.length > 0 ? (
          <span className="rounded bg-primary px-1.5 text-[11px] font-medium text-white">
            {selected.length}
          </span>
        ) : null}
        <span className="text-[9px] text-muted-foreground">▼</span>
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 w-[220px] rounded-md border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`搜索${label}`}
              autoFocus
              className="w-full rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-primary"
            />
          </div>
          <div className="flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground">
            <span>
              已选 {selected.length} / {options.length}
            </span>
            {selected.length > 0 ? (
              <button type="button" onClick={() => onChange([])} className="text-primary">
                清空
              </button>
            ) : null}
          </div>
          <div className="max-h-60 overflow-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">无匹配</div>
            ) : (
              filtered.map((o) => (
                <label
                  key={o}
                  className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(o)}
                    onChange={() => toggle(o)}
                  />
                  <span className="truncate text-sm" title={o}>
                    {o}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Filters({
  filters,
  onChange,
  brokerOptions,
  brokerSel,
  onBrokerChange,
}: {
  filters: AnchorFilters;
  onChange: (f: AnchorFilters) => void;
  brokerOptions?: BrokerOptions | null;
  brokerSel?: BrokerSelection;
  onBrokerChange?: (next: BrokerSelection) => void;
}): React.JSX.Element {
  function setRange(from: string, to: string): void {
    onChange({ ...filters, date_from: from, date_to: to });
  }

  const sel = brokerSel ?? { operate: [], recruit: [] };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <input
        type="date"
        value={filters.date_from}
        onChange={(e) => onChange({ ...filters, date_from: e.target.value })}
        className={`${transparentInput} w-[140px] shrink-0`}
      />
      <span className="text-muted-foreground shrink-0">~</span>
      <input
        type="date"
        value={filters.date_to}
        onChange={(e) => onChange({ ...filters, date_to: e.target.value })}
        className={`${transparentInput} w-[140px] shrink-0`}
      />

      <div className="flex shrink-0 gap-1">
        <Button size="sm" variant="ghost" onClick={() => setRange(yesterday(), yesterday())}>
          昨日
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setRange(daysAgo(7), yesterday())}>
          近 7 日
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setRange(daysAgo(30), yesterday())}>
          近 30 日
        </Button>
      </div>

      <Select
        value={filters.project ?? "all"}
        onValueChange={(v) => onChange({ ...filters, project: v ?? "all" })}
      >
        <SelectTrigger className="w-[110px] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部项目</SelectItem>
          <SelectItem value="ddz">斗地主</SelectItem>
          <SelectItem value="three">三国</SelectItem>
        </SelectContent>
      </Select>

      {brokerOptions && onBrokerChange ? (
        <>
          <MultiSelect
            label="运营经纪人"
            options={brokerOptions.operate}
            selected={sel.operate}
            onChange={(operate) => onBrokerChange({ ...sel, operate })}
          />
          <MultiSelect
            label="招募经纪人"
            options={brokerOptions.recruit}
            selected={sel.recruit}
            onChange={(recruit) => onBrokerChange({ ...sel, recruit })}
          />
        </>
      ) : null}

      <input
        placeholder="搜索昵称/抖音号"
        value={filters.search ?? ""}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        className={`${transparentInput} ml-auto min-w-0 max-w-[240px] flex-1`}
      />
    </div>
  );
}
