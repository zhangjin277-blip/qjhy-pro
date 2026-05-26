"use client";
import type { BoardCard } from "@/modules/editing-task";
import { formatDwellTime, dwellSeverity } from "../_lib/dwell";
import { QuickAssignChip } from "./quick-assign-chip";

interface Props {
  card: BoardCard;
  selected: boolean;
  onSelect: (id: number) => void;
  onOpenDrawer: (id: number) => void;
  editors: { userId: string; name: string }[];
}

export function Card({ card, selected, onSelect, onOpenDrawer, editors }: Props) {
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
      className={`group relative mb-2 cursor-pointer overflow-hidden rounded-xl border bg-white/92 p-3 shadow-card backdrop-blur transition hover:-translate-y-px hover:shadow-card-hover ${
        selected
          ? "border-[var(--selection-primary)] bg-[var(--selection-bg)] ring-2 ring-[var(--selection-ring)]"
          : card.priority === "urgent"
            ? "border-red-300 hover:border-red-400"
            : "border-border-subtle hover:border-[var(--hover-ring)]"
      }`}
    >
      {card.priority === "urgent" && (
        <span className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-red-500" aria-hidden />
      )}
      <div
        data-checkbox=""
        onClick={(e) => {
          e.stopPropagation();
          onSelect(card.id);
        }}
        className={`absolute left-2 top-2 flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded border-[1.5px] transition-colors ${
          selected
            ? "border-[var(--selection-primary)] bg-[var(--selection-primary)]"
            : "border-slate-300 bg-white hover:border-[var(--selection-primary)]"
        }`}
      >
        {selected && <span className="text-[12px] font-bold leading-none text-white">✓</span>}
      </div>
      <div className="pl-7">
        <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <span>{card.liveAccountName}</span>
          {card.priority === "urgent" && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
              🔴 紧急
            </span>
          )}
        </div>
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
          {card.isDisqualified && (
            <span
              className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-600"
              title={card.disqualifiedReason ?? "未填原因"}
            >
              ❌ 不合格
            </span>
          )}
          {card.isDuplicate && (
            <span
              className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500"
              title="重复素材"
            >
              ♻️ 重复
            </span>
          )}
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
            <QuickAssignChip taskId={card.id} editors={editors} />
          )}
          <span className={`tabular-nums ${dwellClass}`}>
            {card.materialDate.slice(5)} · {dwell}
          </span>
        </div>
      </div>
    </div>
  );
}
