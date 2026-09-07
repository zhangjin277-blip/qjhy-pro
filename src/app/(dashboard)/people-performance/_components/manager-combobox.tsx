"use client";

import { useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";

export interface ManagerOption {
  userId: string;
  name: string;
}

export function ManagerCombobox({
  managers,
  value,
  placeholder,
  allowClear = false,
  onValueChange,
}: {
  managers: ManagerOption[];
  value: string | null;
  placeholder: string;
  allowClear?: boolean;
  onValueChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = managers.find((manager) => manager.userId === value);
  const needle = query.trim().toLowerCase();
  const filteredManagers = needle
    ? managers.filter((manager) => manager.name.toLowerCase().includes(needle))
    : managers;

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-input bg-white px-2.5 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        onClick={() => {
          setOpen((current) => !current);
          setQuery("");
        }}
      >
        <span className={selected ? "truncate" : "truncate text-muted-foreground"}>
          {selected?.name ?? placeholder}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="关闭上级选择"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full z-50 mt-1 w-[280px] overflow-hidden rounded-md border bg-white shadow-lg">
            <div className="relative border-b p-2">
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setOpen(false);
                  const onlyManager = filteredManagers.length === 1 ? filteredManagers[0] : null;
                  if (event.key === "Enter" && onlyManager) {
                    onValueChange(onlyManager.userId);
                    setOpen(false);
                  }
                }}
                placeholder="搜索姓名"
                className="pl-8"
              />
            </div>
            <div role="listbox" className="max-h-64 overflow-y-auto p-1">
              {allowClear && (
                <button
                  type="button"
                  role="option"
                  aria-selected={value === null}
                  className="flex w-full items-center justify-between rounded px-2 py-2 text-left text-sm text-muted-foreground hover:bg-slate-50 aria-selected:bg-slate-50"
                  onClick={() => {
                    onValueChange(null);
                    setOpen(false);
                  }}
                >
                  <span className="flex items-center gap-2">
                    <X className="size-3.5" />
                    不配置隔级上级
                  </span>
                  {value === null && <Check className="size-4" />}
                </button>
              )}
              {filteredManagers.length === 0 ? (
                <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                  没有匹配的人员
                </div>
              ) : (
                filteredManagers.map((manager) => (
                  <button
                    key={manager.userId}
                    type="button"
                    role="option"
                    aria-selected={manager.userId === value}
                    className="flex w-full items-center justify-between rounded px-2 py-2 text-left text-sm hover:bg-blue-50 aria-selected:bg-blue-50 aria-selected:text-blue-700"
                    onClick={() => {
                      onValueChange(manager.userId);
                      setOpen(false);
                    }}
                  >
                    <span>{manager.name}</span>
                    {manager.userId === value && <Check className="size-4" />}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
