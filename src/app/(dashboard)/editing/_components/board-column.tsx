"use client";
import { useState } from "react";
import type { BoardCard, EditingTaskStatus } from "@/modules/editing-task";
import { Group } from "./board-group";
import { groupBoardCards } from "../_lib/group-by-date";

/** 每列状态色（变体 B 色调浮卡用） */
export interface ColumnAccent {
  solid: string;
  lightBg: string;
  text: string;
  border: string;
}

export const STATUS_ACCENT: Record<EditingTaskStatus, ColumnAccent> = {
  uploaded: { solid: "#3b82f6", lightBg: "#eff6ff", text: "#2563eb", border: "#bfdbfe" },
  editing: { solid: "#f59e0b", lightBg: "#fffbeb", text: "#d97706", border: "#fde68a" },
  review: { solid: "#a855f7", lightBg: "#faf5ff", text: "#9333ea", border: "#e9d5ff" },
  ready: { solid: "#06b6d4", lightBg: "#ecfeff", text: "#0891b2", border: "#a5f3fc" },
  published: { solid: "#22c55e", lightBg: "#f0fdf4", text: "#16a34a", border: "#bbf7d0" },
};

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
  cards,
  selectedIds,
  onSelect,
  onOpenDrawer,
  editors,
  onDropToColumn,
}: Props) {
  const field = status === "published" ? "publishedAt" : "materialDate";
  const groups = groupBoardCards(cards, field);
  const [dragOver, setDragOver] = useState(false);
  const accent = STATUS_ACCENT[status];

  // 今日 / 逾期 概览（按素材日期，跟当前日期筛选范围内的卡片算）
  // 已发布列是终态、不算逾期，只在前 4 列显示该胶囊。
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  const todayCount = cards.filter((c) => c.materialDate === today).length;
  const overdueCount = cards.filter((c) => c.materialDate < today).length;
  const showSummary = status !== "published";

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
      className={`flex min-h-[620px] flex-col rounded-2xl border bg-white p-3 pt-3.5 transition-colors ${
        dragOver ? "border-blue-500 ring-2 ring-blue-200" : "border-border-subtle"
      } shadow-[0_10px_30px_-22px_rgba(40,55,120,0.5)]`}
      style={{ borderTop: `3px solid ${accent.solid}` }}
    >
      <div className="mb-1 flex items-center justify-between px-0.5">
        <span
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13.5px] font-bold"
          style={{ backgroundColor: accent.lightBg, color: accent.text }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent.solid }} />
          {label}
        </span>
        <span className="text-[13px] font-extrabold tabular-nums text-slate-900">
          {cards.length}
        </span>
      </div>
      {showSummary && (
        <div className="mb-2 px-1 text-[11px] text-slate-400">
          今日 <b style={{ color: accent.text }}>{todayCount}</b>
          {overdueCount > 0 && (
            <>
              {" · "}
              <span className="text-[var(--change-up)]">逾期 {overdueCount}</span>
            </>
          )}
        </div>
      )}
      {groups.map((g) => (
        <Group
          key={g.label}
          label={g.label}
          cards={g.cards}
          defaultOpen={g.defaultOpen}
          variant={g.variant}
          accent={accent}
          selectedIds={selectedIds}
          onSelect={onSelect}
          onOpenDrawer={onOpenDrawer}
          editors={editors}
        />
      ))}
    </div>
  );
}
