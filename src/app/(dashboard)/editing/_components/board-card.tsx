"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import type { BoardCard } from "@/modules/editing-task";
import { QuickAssignChip } from "./quick-assign-chip";
import { VideoPreviewModal } from "./video-preview-modal";

/** 秒 → m:ss（素材时长） */
function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface Props {
  card: BoardCard;
  selected: boolean;
  onSelect: (id: number) => void;
  onOpenDrawer: (id: number) => void;
  editors: { userId: string; name: string }[];
}

export function Card({ card, selected, onSelect, onOpenDrawer, editors }: Props) {
  const [preview, setPreview] = useState<"source" | "edited" | null>(null);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(
          "application/x-editing-task",
          JSON.stringify({ id: card.id, status: card.status }),
        );
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-checkbox]")) return;
        onOpenDrawer(card.id);
      }}
      className={`group relative mb-2 cursor-pointer overflow-hidden rounded-xl border bg-white/92 p-3 shadow-card backdrop-blur transition hover:-translate-y-px hover:shadow-card-hover ${
        selected
          ? "border-[var(--selection-primary)] bg-[var(--selection-bg)] ring-2 ring-[var(--selection-ring)]"
          : card.priority === "urgent"
            ? "border-red-300 hover:border-red-400"
            : "border-slate-300 hover:border-slate-400"
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
        className={`absolute left-2 top-2 flex h-5 w-5 cursor-pointer items-center justify-center rounded-[5px] border-2 shadow-sm transition-colors ${
          selected
            ? "border-[var(--selection-primary)] bg-[var(--selection-primary)]"
            : "border-slate-400 bg-white hover:border-[var(--selection-primary)] hover:bg-blue-50"
        }`}
      >
        {selected && <span className="text-[13px] font-bold leading-none text-white">✓</span>}
      </div>
      <div className="pl-7">
        <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <span className="min-w-0 truncate">{card.liveAccountName}</span>
          {card.priority === "urgent" && (
            <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
              🔴 紧急
            </span>
          )}
          <span className="ml-auto shrink-0 text-xs font-medium tabular-nums text-slate-500">
            {card.materialDate.slice(5)}
          </span>
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
          {card.sourceDurationSec != null && (
            <span
              className="ml-auto flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-slate-600"
              title="素材时长"
            >
              ⏱ {fmtDuration(card.sourceDurationSec)}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center border-t border-dashed border-border-default pt-2 text-xs">
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
        </div>
        {(card.hasSource || card.hasEdited) && (
          <div className="mt-2 flex gap-1.5">
            {card.hasSource && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPreview("source");
                }}
                className="flex flex-1 items-center justify-center gap-1 rounded-md border border-slate-200 bg-slate-50 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
              >
                ▶ 素材
              </button>
            )}
            {card.hasEdited && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPreview("edited");
                }}
                className="flex flex-1 items-center justify-center gap-1 rounded-md border border-slate-200 bg-slate-50 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-600"
              >
                ▶ 成品
              </button>
            )}
          </div>
        )}
      </div>
      {preview &&
        typeof document !== "undefined" &&
        createPortal(
          // 用 portal 渲染到 body：脱离卡片的 backdrop-blur 包含块 + overflow-hidden，
          // 否则 fixed 遮罩会被限制在卡片内变小。stopPropagation 防 portal 事件冒泡到卡片 onClick。
          <div
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            onDragStart={(e) => e.stopPropagation()}
          >
            <VideoPreviewModal
              src={`/api/editing/download?taskId=${card.id}&kind=${preview}&index=0&inline=1`}
              fileName={`${card.liveAccountName} ${preview === "source" ? "素材" : "成品"}`}
              onClose={() => setPreview(null)}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
