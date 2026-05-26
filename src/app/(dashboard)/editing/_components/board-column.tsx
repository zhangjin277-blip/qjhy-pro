"use client";
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
}: Props) {
  const field = status === "published" ? "publishedAt" : "enteredStatusAt";
  const groups = groupBoardCards(cards, field);

  return (
    <div className="flex min-h-[620px] flex-col rounded-xl border border-border-subtle bg-slate-50/70 p-3">
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
