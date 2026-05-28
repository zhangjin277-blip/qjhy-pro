"use client";

import { MoreHorizontal } from "lucide-react";
import type { AnchorWithDingtalk } from "@/modules/live-anchor";
import { PlatformBadge } from "../../live-accounts/_components/platform-badge";
import { blStyle } from "./anchor-business-line-styles";
import { AnchorSlotStrip } from "./anchor-slot-strip";

export interface BindingLite {
  id: string;
  account_id: string | null;
  dingtalk_user_id: string;
  account_name: string | null;
  platform: string | null;
  time_slots: [string, string][];
  rest_days: number[];
}

interface AnchorCardProps {
  anchor: AnchorWithDingtalk;
  bindings: BindingLite[];
  onEdit: (anchor: AnchorWithDingtalk) => void;
}

function statusPill(status: string): { label: string; cls: string; pulse: boolean } {
  if (status === "active") {
    return {
      label: "在播",
      cls: "bg-emerald-50 text-emerald-700",
      pulse: true,
    };
  }
  if (status === "rest") {
    return {
      label: "休息",
      cls: "bg-amber-50 text-amber-700",
      pulse: false,
    };
  }
  return {
    label: "离职",
    cls: "bg-slate-100 text-slate-500",
    pulse: false,
  };
}

function statusDot(status: string): string {
  if (status === "active") return "bg-emerald-500";
  if (status === "rest") return "bg-amber-500";
  return "bg-slate-400";
}

function employmentChip(value: string): string {
  if (value === "正式") return "border-emerald-200 bg-emerald-100 text-emerald-700";
  if (value === "合作") return "border-slate-200 bg-slate-100 text-slate-700";
  // 试播
  return "border-dashed border-orange-300 bg-white text-orange-700";
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export function AnchorCard({ anchor, bindings, onEdit }: AnchorCardProps) {
  const s = blStyle(anchor.business_line);
  const status = statusPill(anchor.work_status);
  const initial = Array.from(anchor.name.trim())[0] ?? "?";
  const leaveDate = anchor.leave_date;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onEdit(anchor)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit(anchor);
        }
      }}
      className="group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {/* 顶部色条 */}
      <div className={`h-1 bg-gradient-to-r ${s.gradient}`} />

      <div className="space-y-3.5 p-4">
        {/* identity row */}
        <div className="flex items-start gap-3">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-lg font-semibold text-white shadow-inner ${s.gradient}`}
            style={{ textShadow: "0 1px 0 rgba(0,0,0,0.18)" }}
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[15px] font-semibold text-slate-900">
                {anchor.name}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${status.cls}`}
              >
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${statusDot(anchor.work_status)} ${status.pulse ? "animate-pulse" : ""}`}
                />
                {status.label}
              </span>
            </div>
            <div className="mt-0.5 truncate text-[12px] text-slate-500">
              {anchor.external_name && (
                <>
                  <span className="text-slate-400">艺名 · </span>
                  <span>{anchor.external_name}</span>
                </>
              )}
              {anchor.external_name && anchor.title && (
                <span className="mx-1.5 text-slate-300">|</span>
              )}
              {anchor.title && <span className="text-slate-400">{anchor.title}</span>}
              {!anchor.external_name && !anchor.title && (
                <span className="text-slate-300">未填艺名</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(anchor);
            }}
            className="shrink-0 rounded p-1 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100"
            aria-label="编辑"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>

        {/* chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-medium ${s.chipBg} ${s.chipFg} ${s.chipBd}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full bg-gradient-to-br ${s.gradient}`} />
            {anchor.business_line}
          </span>
          <span
            className={`inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-medium ${employmentChip(anchor.employment_type)}`}
          >
            {anchor.employment_type}
          </span>
        </div>

        {/* date timeline */}
        <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] tabular-nums text-slate-600">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">试播</span>
            <span className="font-medium text-slate-700">
              {formatDate(anchor.trial_start_date)}
            </span>
          </div>
          <span className="text-slate-300">→</span>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">签约</span>
            <span
              className={`font-medium ${anchor.contract_date ? "text-slate-700" : "text-slate-400"}`}
            >
              {anchor.contract_date ? formatDate(anchor.contract_date) : "未签约"}
            </span>
          </div>
          {leaveDate && (
            <>
              <span className="text-slate-300">→</span>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">离职</span>
                <span className="font-medium text-rose-600">{formatDate(leaveDate)}</span>
              </div>
            </>
          )}
        </div>

        {/* bindings */}
        <div>
          <div className="mb-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400">
            <span>绑定账号</span>
            <span
              className={`tabular-nums ${bindings.length ? "text-blue-600" : "text-slate-400"}`}
            >
              {bindings.length} 个
            </span>
          </div>
          {bindings.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-center text-[11px] text-slate-400">
              暂无绑定账号
            </div>
          ) : (
            <ul className="space-y-1.5">
              {bindings.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center gap-2.5 rounded-lg border border-slate-200/70 bg-slate-50/50 px-2.5 py-2"
                >
                  {b.platform && <PlatformBadge platform={b.platform} size="xs" />}
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-800">
                    {b.account_name ?? "—"}
                  </span>
                  {b.time_slots.length > 0 && <AnchorSlotStrip slots={b.time_slots} />}
                  <span className="whitespace-nowrap font-mono text-[10.5px] tabular-nums text-slate-500">
                    {b.time_slots.length === 0
                      ? "—"
                      : b.time_slots.map(([a, c]) => `${a}-${c}`).join(" / ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-2.5 text-[11px] text-slate-400">
          <span className="tabular-nums">更新于 {formatDate(anchor.updated_at)}</span>
          <span className="font-medium text-blue-500 transition-colors group-hover:text-blue-700">
            查看档案 →
          </span>
        </div>
      </div>
    </div>
  );
}
