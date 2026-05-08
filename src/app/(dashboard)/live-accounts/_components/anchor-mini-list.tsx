"use client";

import { hourMatchesTimeSlots } from "@/modules/live-account";
import { getAvatarGradient, type ScheduleBinding } from "./schedule-timeline";

interface AnchorMiniListProps {
  bindings: ScheduleBinding[];
  currentHour?: number;
}

export function AnchorMiniList({ bindings, currentHour }: AnchorMiniListProps) {
  const hour = currentHour ?? new Date().getHours();
  const count = bindings.length;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400">
        <span>{count <= 1 ? "主播" : "轮播主播"}</span>
        <span className="rounded bg-slate-100 px-1 py-0 text-[9.5px] text-slate-600 tabular-nums">
          {count}
        </span>
      </div>
      {bindings.length === 0 && <div className="text-[11px] text-slate-400">暂无主播绑定</div>}
      {bindings.map((b, idx) => {
        const isNow = hourMatchesTimeSlots(b.time_slots, hour);
        const [from, to] = getAvatarGradient(idx);
        const firstName = (b.anchor_name ?? "?").slice(0, 1);

        // 时间段每段一行（多段不挤同一行）
        const timeLines = b.time_slots.map(([s, e]) => `${s.slice(0, 5)}–${e.slice(0, 5)}`);

        return (
          <div
            key={b.dingtalk_user_id}
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[11.5px] ${
              isNow ? "border border-blue-100 bg-blue-50" : "bg-slate-50"
            }`}
          >
            {/* Avatar */}
            <div
              className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
              style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
            >
              {firstName}
            </div>
            {/* Name — 当前直播中：标红 */}
            <span
              className={`min-w-0 flex-shrink truncate font-medium ${
                isNow ? "text-rose-500" : "text-slate-800"
              }`}
            >
              {b.anchor_name ?? "—"}
            </span>
            {/* Time — 多段每段独占一行 */}
            <div
              className="ml-auto flex flex-col items-end gap-0.5 text-[10.5px] leading-tight text-slate-500 tabular-nums"
              style={{ fontFamily: 'ui-monospace, "SF Mono", monospace' }}
            >
              {timeLines.map((t, i) => (
                <span key={i} className="whitespace-nowrap">
                  {t}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
