"use client";
import { useState } from "react";
import type { BoardCard } from "@/modules/editing-task";
import { Card } from "./board-card";

interface Props {
  label: string;
  cards: BoardCard[];
  defaultOpen: boolean;
  selectedIds: Set<number>;
  onSelect: (id: number) => void;
  onOpenDrawer: (id: number) => void;
  editors: { userId: string; name: string }[];
}

const MAX_VISIBLE = 6;

export function Group({
  label,
  cards,
  defaultOpen,
  selectedIds,
  onSelect,
  onOpenDrawer,
  editors,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? cards : cards.slice(0, MAX_VISIBLE);
  const remaining = cards.length - visible.length;

  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 hover:bg-[var(--selection-bg)] hover:text-blue-600"
      >
        <span className={`text-[9px] transition-transform ${open ? "" : "-rotate-90"}`}>▼</span>
        <span>{label}</span>
        <span className="ml-auto text-[11px] font-medium text-slate-400">{cards.length}</span>
      </button>
      {open && (
        <div>
          {visible.map((c) => (
            <Card
              key={c.id}
              card={c}
              selected={selectedIds.has(c.id)}
              onSelect={onSelect}
              onOpenDrawer={onOpenDrawer}
              editors={editors}
            />
          ))}
          {remaining > 0 && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="block w-full rounded p-1.5 text-center text-[11px] text-blue-600 hover:bg-[var(--selection-bg)]"
            >
              + 查看其余 {remaining} 条
            </button>
          )}
        </div>
      )}
    </div>
  );
}
