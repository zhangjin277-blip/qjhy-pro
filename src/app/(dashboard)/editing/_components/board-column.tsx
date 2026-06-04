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
  // 分列日期口径：
  //   待剪辑 → 素材日期（看素材积压，今天批量传的老素材不会被堆成"今天"）
  //   剪辑中/审核/待发布 → 进入该状态的日期（领取日/成品日/审核通过日，工作发生那天）
  //   已发布 → 发布日期
  const field =
    status === "uploaded"
      ? "materialDate"
      : status === "published"
        ? "publishedAt"
        : "enteredStatusAt";
  const groups = groupBoardCards(cards, field);
  const [dragOver, setDragOver] = useState(false);
  const accent = STATUS_ACCENT[status];

  // 今日 / 逾期 概览（用与分组相同的字段算，跟当前日期筛选范围内的卡片）
  // 已发布列是终态、不算逾期，只在前 4 列显示该胶囊。
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  const dateOf = (c: BoardCard) => {
    const v = c[field];
    return typeof v === "string" && v ? v.slice(0, 10) : today;
  };
  const todayCount = cards.filter((c) => dateOf(c) === today).length;
  const overdueCount = cards.filter((c) => dateOf(c) < today).length;
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
      className={`flex min-h-[620px] flex-col overflow-hidden rounded-xl border bg-white transition-colors ${
        dragOver ? "ring-2 ring-blue-200" : ""
      } shadow-[0_10px_30px_-22px_rgba(40,55,120,0.5)]`}
      style={{ borderColor: dragOver ? "#3b82f6" : accent.border }}
    >
      {/* 实色头部条 */}
      <div
        className="flex items-center justify-between px-3.5 py-2.5"
        style={{ backgroundColor: accent.solid }}
      >
        <span className="flex items-center gap-1.5 text-[14px] font-bold text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-white/85" />
          {label}
        </span>
        <span className="rounded-full bg-white/25 px-2.5 py-0.5 text-[12.5px] font-bold tabular-nums text-white">
          {cards.length}
        </span>
      </div>
      {/* 今日 / 逾期 胶囊 */}
      {showSummary && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ backgroundColor: accent.lightBg, color: accent.text }}
          >
            今日 {todayCount}
          </span>
          {overdueCount > 0 && (
            <span className="rounded-full bg-[#fff1f0] px-2 py-0.5 text-[11px] font-semibold text-[var(--change-up)]">
              逾期 {overdueCount}
            </span>
          )}
        </div>
      )}
      {/* 正文 */}
      <div className="flex-1 px-2.5 pb-3 pt-2">
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
    </div>
  );
}
