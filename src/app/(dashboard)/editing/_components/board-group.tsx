"use client";
import { useState, type CSSProperties } from "react";
import type { BoardCard } from "@/modules/editing-task";
import { Card } from "./board-card";
import type { ColumnAccent } from "./board-column";

interface Props {
  label: string;
  cards: BoardCard[];
  defaultOpen: boolean;
  variant?: "urgent" | "disqualified" | "default";
  accent: ColumnAccent;
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
  variant,
  accent,
  selectedIds,
  onSelect,
  onOpenDrawer,
  editors,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? cards : cards.slice(0, MAX_VISIBLE);
  const remaining = cards.length - visible.length;

  const isSpecial = variant === "urgent" || variant === "disqualified";

  return (
    <div className="mb-0.5">
      <button
        onClick={() => setOpen(!open)}
        style={
          {
            "--rb": isSpecial ? "#fdecec" : `${accent.solid}14`,
            "--rbh": isSpecial ? "#f9d2d2" : `${accent.solid}29`,
          } as CSSProperties
        }
        className="flex w-full items-center gap-2 rounded-lg bg-[var(--rb)] px-2 py-2 text-[13px] transition-colors hover:bg-[var(--rbh)]"
      >
        <span
          className={`text-[9px] text-slate-300 transition-transform ${open ? "" : "-rotate-90"}`}
        >
          ▼
        </span>
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: isSpecial ? "#f53f3f" : accent.solid }}
        />
        <span
          className={isSpecial ? "font-bold text-[var(--change-up)]" : "font-medium text-slate-600"}
        >
          {label}
        </span>
        <span
          className="ml-auto min-w-[22px] rounded-md px-1.5 text-center text-[12px] font-bold tabular-nums text-white"
          style={{ backgroundColor: isSpecial ? "#f53f3f" : accent.solid }}
        >
          {cards.length}
        </span>
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
