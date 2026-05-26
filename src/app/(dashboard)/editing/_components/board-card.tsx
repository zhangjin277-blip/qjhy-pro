"use client";
import type { BoardCard } from "@/modules/editing-task";
import { formatDwellTime, dwellSeverity } from "../_lib/dwell";

interface Props {
  card: BoardCard;
  selected: boolean;
  onSelect: (id: number) => void;
  onOpenDrawer: (id: number) => void;
}

export function Card({ card, selected, onSelect, onOpenDrawer }: Props) {
  const dwell = formatDwellTime(card.enteredStatusAt);
  const severity = dwellSeverity(card.enteredStatusAt);
  const dwellClass =
    severity === "danger"
      ? "text-red-500 font-semibold"
      : severity === "warn"
        ? "text-amber-600 font-medium"
        : "text-slate-400";

  return (
    <div
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-checkbox]")) return;
        onOpenDrawer(card.id);
      }}
      className={`group relative mb-2 cursor-pointer rounded-xl border bg-white/92 p-3 shadow-card backdrop-blur transition hover:-translate-y-px hover:shadow-card-hover ${
        selected
          ? "border-[var(--selection-primary)] bg-[var(--selection-bg)] ring-2 ring-[var(--selection-ring)]"
          : "border-border-subtle hover:border-[var(--hover-ring)]"
      }`}
    >
      <div
        data-checkbox=""
        onClick={(e) => {
          e.stopPropagation();
          onSelect(card.id);
        }}
        className={`absolute left-2.5 top-2.5 flex h-4 w-4 items-center justify-center rounded border-[1.5px] bg-white transition-opacity ${
          selected
            ? "border-[var(--selection-primary)] bg-[var(--selection-primary)] opacity-100"
            : "border-slate-300 opacity-0 group-hover:opacity-100"
        }`}
      >
        {selected && <span className="text-[11px] font-bold leading-none text-white">✓</span>}
      </div>
      <div className="pl-6">
        <div className="mb-1.5 text-sm font-semibold text-slate-800">{card.liveAccountName}</div>
        <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          {card.anchorName && <span>主播 {card.anchorName}</span>}
          <span
            className="rounded px-1.5 py-0.5 text-[11px]"
            style={{
              backgroundColor: `${card.productAccentColor}1a`,
              color: card.productAccentColor,
            }}
          >
            {card.product}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-dashed border-border-default pt-2 text-xs">
          {card.editorName ? (
            <span className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-[var(--selection-primary)] text-[10px] font-semibold text-white">
                {card.editorName.slice(0, 1)}
              </span>
              <span className="font-medium text-slate-800">{card.editorName}</span>
            </span>
          ) : (
            <span className="text-slate-400">待派单</span>
          )}
          <span className={`tabular-nums ${dwellClass}`}>
            {card.materialDate.slice(5)} · {dwell}
          </span>
        </div>
      </div>
    </div>
  );
}
