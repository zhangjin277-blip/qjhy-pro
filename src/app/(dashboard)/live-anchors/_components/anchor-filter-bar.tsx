"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type EmpFilter = "all" | "正式" | "合作" | "试播";
export type StatusFilter = "all" | "active" | "rest" | "leave";
export type SortKey = "updated_desc" | "updated_asc" | "name" | "trial_desc" | "bindings_desc";

interface SegmentedOption<T extends string> {
  key: T;
  label: string;
  dot?: string; // tailwind bg-* class for status dot
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (key: T) => void;
  options: SegmentedOption<T>[];
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-[11px] tracking-[0.04em] text-slate-400">{label}</span>
      <div className="inline-flex gap-0.5 rounded-md bg-slate-100 p-0.5">
        {options.map((o) => {
          const isActive = value === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onChange(o.key)}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors ${
                isActive
                  ? "bg-white font-semibold text-blue-600 shadow-xs"
                  : "font-medium text-slate-600 hover:text-slate-900"
              }`}
            >
              {o.dot && <span className={`h-1.5 w-1.5 rounded-full ${o.dot}`} />}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface AnchorFilterBarProps {
  empFilter: EmpFilter;
  onEmpChange: (k: EmpFilter) => void;
  statusFilter: StatusFilter;
  onStatusChange: (k: StatusFilter) => void;
  query: string;
  onQueryChange: (v: string) => void;
  sort: SortKey;
  onSortChange: (k: SortKey) => void;
}

export function AnchorFilterBar(props: AnchorFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200/70 bg-white/70 p-2.5 backdrop-blur-sm">
      <Segmented<EmpFilter>
        label="合作模式"
        value={props.empFilter}
        onChange={props.onEmpChange}
        options={[
          { key: "all", label: "全部" },
          { key: "正式", label: "正式" },
          { key: "合作", label: "合作" },
          { key: "试播", label: "试播" },
        ]}
      />
      <Segmented<StatusFilter>
        label="状态"
        value={props.statusFilter}
        onChange={props.onStatusChange}
        options={[
          { key: "all", label: "全部" },
          { key: "active", label: "在播", dot: "bg-emerald-500" },
          { key: "rest", label: "休息", dot: "bg-amber-500" },
          { key: "leave", label: "离职", dot: "bg-slate-400" },
        ]}
      />

      <div className="flex-1" />

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <Input
          value={props.query}
          onChange={(e) => props.onQueryChange(e.target.value)}
          placeholder="搜索姓名 / 艺名…"
          className="h-8 w-52 pl-8 text-xs"
        />
      </div>

      <div className="inline-flex items-center gap-1.5">
        <span className="text-[11px] tracking-[0.04em] text-slate-400">排序</span>
        <Select value={props.sort} onValueChange={(v) => props.onSortChange(v as SortKey)}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated_desc">更新时间 · 新→旧</SelectItem>
            <SelectItem value="updated_asc">更新时间 · 旧→新</SelectItem>
            <SelectItem value="name">姓名 A-Z</SelectItem>
            <SelectItem value="trial_desc">试播日 · 新→旧</SelectItem>
            <SelectItem value="bindings_desc">绑定账号 · 多→少</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
