"use client";
import { useState } from "react";
import type { BoardCard, EditingTaskStatus } from "@/modules/editing-task";
import { Group } from "./board-group";
import { groupBoardCards } from "../_lib/group-by-date";

interface Props {
  status: EditingTaskStatus;
  label: string;
  dotColorClass: string;
  cards: BoardCard[];
  selectedIds: Set<number>;
  onSelect: (id: number) => void;
  onOpenDrawer: (id: number) => void;
  editors: { userId: string; name: string }[];
  onDropToColumn?: (
    taskId: number,
    fromStatus: EditingTaskStatus,
    toStatus: EditingTaskStatus,
  ) => void;
}

export function Column({
  status,
  label,
  dotColorClass,
  cards,
  selectedIds,
  onSelect,
  onOpenDrawer,
  editors,
  onDropToColumn,
}: Props) {
  const field = status === "published" ? "publishedAt" : "enteredStatusAt";
  const groups = groupBoardCards(cards, field);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-editing-task")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const data = e.dataTransfer.getData("application/x-editing-task");
        if (!data) return;
        try {
          const parsed = JSON.parse(data) as {
            id: number;
            status: EditingTaskStatus;
          };
          onDropToColumn?.(parsed.id, parsed.status, status);
        } catch {
          // ignore malformed drag data
        }
      }}
      className={`flex min-h-[620px] flex-col rounded-xl border p-3 transition-colors ${
        dragOver
          ? "border-blue-500 ring-2 ring-blue-200 bg-blue-50/40"
          : "border-border-subtle bg-slate-50/70"
      }`}
    >
      <div className="mb-3 flex items-center gap-2 px-1.5">
        <span className={`h-2 w-2 rounded-full ${dotColorClass}`} />
        <span className="text-sm font-semibold">{label}</span>
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600 tabular-nums">
          {cards.length}
        </span>
      </div>
      {groups.map((g) => (
        <Group
          key={g.label}
          label={g.label}
          cards={g.cards}
          defaultOpen={g.defaultOpen}
          variant={g.variant}
          selectedIds={selectedIds}
          onSelect={onSelect}
          onOpenDrawer={onOpenDrawer}
          editors={editors}
        />
      ))}
    </div>
  );
}
