"use client";

import { MoreHorizontal } from "lucide-react";
import type { AnchorWithDingtalk } from "@/modules/live-anchor";
import { PlatformBadge } from "../../live-accounts/_components/platform-badge";
import { blStyle } from "./anchor-business-line-styles";

export interface BindingLite {
  id: string;
  account_id: string | null;
  dingtalk_user_id: string;
  account_name: string | null;
  platform: string | null;
  time_slots: [string, string][];
  rest_days: number[];
}

/** 主播档案的绑定列表只展示账号名 + 平台，不展示排班 */
type BindingForCard = Pick<BindingLite, "id" | "account_name" | "platform">;

interface AnchorBentoCardProps {
  anchor: AnchorWithDingtalk;
  bindings: BindingForCard[];
  onEdit: (anchor: AnchorWithDingtalk) => void;
}

function statusPill(status: string): { label: string; cls: string; pulse: boolean } {
  if (status === "active") {
    return { label: "在播", cls: "bg-emerald-50 text-emerald-600", pulse: true };
  }
  if (status === "rest") {
    return { label: "休息", cls: "bg-amber-50 text-amber-700", pulse: false };
  }
  return { label: "离职", cls: "bg-slate-100 text-slate-500", pulse: false };
}

function statusDot(status: string): string {
  if (status === "active") return "bg-emerald-500 animate-pulse";
  if (status === "rest") return "bg-amber-500";
  return "bg-slate-400";
}

function employmentChip(value: string): string {
  if (value === "正式") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "合作") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-dashed border-orange-300 bg-white text-orange-700";
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export function AnchorBentoCard({ anchor, bindings, onEdit }: AnchorBentoCardProps) {
  const s = blStyle(anchor.business_line);
  const status = statusPill(anchor.work_status);
  const initial = Array.from(anchor.name.trim())[0] ?? "?";

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
      className="group relative grid cursor-pointer gap-[18px] rounded-[14px] border border-slate-100 bg-white p-[18px] pb-4 shadow-sm transition-all duration-150 hover:-translate-y-px hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 md:grid-cols-[1.4fr_1fr]"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit(anchor);
        }}
        className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-md text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100"
        title="编辑"
        aria-label="编辑"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {/* Left: identity + meta + chips */}
      <div className="flex flex-col gap-3">
        {/* head */}
        <div className="flex items-center justify-between gap-2 pr-8">
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${s.gradient} text-base font-semibold text-white shadow-sm [text-shadow:0_1px_0_rgba(0,0,0,0.15)]`}
            >
              {initial}
            </div>
            <span className="truncate text-[15px] font-semibold leading-tight text-slate-900">
              {anchor.name}
            </span>
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-[3px] text-[11px] font-medium ${status.cls}`}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${statusDot(anchor.work_status)}`}
            />
            {status.label}
          </span>
        </div>

        {/* meta grid 2 cols */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-slate-500">
          <div className="text-[10.5px] uppercase tracking-[0.06em] text-slate-400">业务线</div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] text-slate-400">合作模式</div>
          <div>
            <span
              className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-px text-[11px] font-medium ${s.chipBg} ${s.chipFg} ${s.chipBd}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full bg-gradient-to-br ${s.gradient}`} />
              {anchor.business_line}
            </span>
          </div>
          <div>
            <span
              className={`inline-flex items-center rounded border px-1.5 py-px text-[11px] font-medium ${employmentChip(anchor.employment_type)}`}
            >
              {anchor.employment_type}
            </span>
          </div>

          <div className="text-[10.5px] uppercase tracking-[0.06em] text-slate-400">艺名</div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] text-slate-400">职级</div>
          <div className="truncate text-slate-700">
            {anchor.external_name ?? <span className="text-slate-300">—</span>}
          </div>
          <div className="truncate text-slate-700">
            {anchor.title ?? <span className="text-slate-300">—</span>}
          </div>

          <div className="text-[10.5px] uppercase tracking-[0.06em] text-slate-400">试播日</div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] text-slate-400">签约日</div>
          <div className="font-mono text-[11px] tabular-nums text-slate-700">
            {anchor.trial_start_date ? (
              formatDate(anchor.trial_start_date)
            ) : (
              <span className="text-slate-300">—</span>
            )}
          </div>
          <div className="font-mono text-[11px] tabular-nums text-slate-700">
            {anchor.contract_date ? (
              formatDate(anchor.contract_date)
            ) : (
              <span className="text-slate-300">未签约</span>
            )}
          </div>
        </div>

        {anchor.leave_date && (
          <div className="-mt-1 inline-flex items-center gap-1.5 text-[11px] text-rose-600">
            <span className="text-slate-400">离职日</span>
            <span className="font-mono tabular-nums">{formatDate(anchor.leave_date)}</span>
          </div>
        )}
      </div>

      {/* Right: bindings */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-[10.5px] uppercase tracking-[0.06em] text-slate-400">
          <span>绑定账号</span>
          <span className={`tabular-nums ${bindings.length ? "text-blue-600" : "text-slate-400"}`}>
            {bindings.length} 个
          </span>
        </div>
        {bindings.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-4 text-center text-[11px] text-slate-400">
            暂无绑定账号
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {bindings.map((b) => (
              <li
                key={b.id}
                className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50/50 px-2 py-1.5"
              >
                {b.platform && <PlatformBadge platform={b.platform} size="xs" />}
                <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-slate-700">
                  {b.account_name ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
