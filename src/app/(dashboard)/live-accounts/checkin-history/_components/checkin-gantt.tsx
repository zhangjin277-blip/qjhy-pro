"use client";

import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import type { CheckinDayResult, CheckinDaySession } from "@/modules/checkin/queries";

interface Props {
  data: CheckinDayResult;
}

// 业务日窗口：当天 0:00 → 次日 9:00（33 小时）。
// 主播作息：9 点上播 → 跨夜播到次日 9 点前下播。所以一个完整业务日跨自然日。
// 前 0-9 点保留显示当天凌晨班（前一夜延续过来的）。
const HOURS = 33;
const ROW_HEIGHT = 36;
const LEFT_AXIS_WIDTH = 180;
const HOUR_LABEL_HEIGHT = 22;

function statusColor(s: CheckinDaySession): { bar: string; border: string; text: string } {
  if (s.status === "in_progress")
    return { bar: "bg-blue-100", border: "border-blue-500", text: "text-blue-900" };
  if (s.status === "ended")
    return { bar: "bg-emerald-100", border: "border-emerald-500", text: "text-emerald-900" };
  if (s.status === "auto_closed_by_next")
    return { bar: "bg-orange-100", border: "border-orange-500", text: "text-orange-900" };
  if (s.status === "auto_closed_by_offline")
    return { bar: "bg-red-100", border: "border-red-500", text: "text-red-900" };
  return { bar: "bg-slate-100", border: "border-slate-400", text: "text-slate-700" };
}

function statusLabel(s: CheckinDaySession): string {
  if (s.status === "in_progress") return "进行中";
  if (s.status === "ended") return "正常下播";
  if (s.status === "auto_closed_by_next") return "被接班";
  if (s.status === "auto_closed_by_offline") return "系统检测离线";
  if (s.status === "auto_closed_by_cron") return "系统兜底";
  return s.status;
}

function fmtGift(cents: number): string {
  const yuan = cents / 100;
  if (yuan >= 10000) return `${(yuan / 10000).toFixed(1)}万`;
  if (yuan >= 1000) return Math.round(yuan).toLocaleString("zh-CN");
  return yuan.toFixed(1);
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h${m}m`;
  return `${m}m`;
}

/** 把 session [start_at, end_at] 投影到 0 - HOURS 的相对位置（百分比）；end_at=null 用 now */
function projectSession(
  session: CheckinDaySession,
  dayIso: string,
  pxPerHour: number,
  nowMs: number,
): { left: number; width: number; visible: boolean } {
  const dayStart = new Date(dayIso + "T00:00:00").getTime();
  const dayEnd = dayStart + HOURS * 3600 * 1000; // 当天 0:00 + 33h = 次日 9:00
  const startMs = new Date(session.start_at).getTime();
  const endMs = session.end_at ? new Date(session.end_at).getTime() : nowMs;

  // 截断到业务日窗口
  const cs = Math.max(startMs, dayStart);
  const ce = Math.min(endMs, dayEnd);
  if (ce <= cs) return { left: 0, width: 0, visible: false };

  const left = ((cs - dayStart) / (3600 * 1000)) * pxPerHour;
  const width = ((ce - cs) / (3600 * 1000)) * pxPerHour;
  // 这里 width 是百分比 (0-1)，不在这里强加 min；细于 1px 的条用 CSS min-width:3px 兜底
  return { left, width, visible: true };
}

export function CheckinGantt({ data }: Props): React.JSX.Element {
  const [hover, setHover] = useState<CheckinDaySession | null>(null);
  const [now, setNow] = useState(Date.now());

  // in_progress 实时长大
  useEffect(() => {
    const hasInProgress = data.accounts.some((a) =>
      a.sessions.some((s) => s.status === "in_progress"),
    );
    if (!hasInProgress) return;
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, [data]);

  // 按 product 分组
  const groups = new Map<string, typeof data.accounts>();
  for (const acc of data.accounts) {
    const arr = groups.get(acc.product) ?? [];
    arr.push(acc);
    groups.set(acc.product, arr);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[1100px] relative">
          {/* 24h header */}
          <div
            className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-10"
            style={{ paddingLeft: `${LEFT_AXIS_WIDTH}px`, height: `${HOUR_LABEL_HEIGHT}px` }}
          >
            <HourLabels />
          </div>

          {/* 各 product 分组 */}
          {[...groups.entries()].map(([productName, accounts]) => (
            <div key={productName}>
              <div className="border-b border-slate-100 bg-slate-50/50 px-3 py-1.5 text-[11px] font-semibold text-slate-600">
                {productName} <span className="text-slate-400">· {accounts.length} 个账号</span>
              </div>
              {accounts.map((acc) => (
                <AccountRow
                  key={acc.live_account_id}
                  account={acc}
                  dayIso={data.date}
                  nowMs={now}
                  onHover={setHover}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <Legend />

      {/* Hover tooltip */}
      {hover && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-md bg-slate-900 px-4 py-2 text-[12px] text-white shadow-xl">
          <span className="font-medium">{hover.anchor_name}</span>
          <span className="mx-2 text-slate-400">·</span>
          <span>
            {fmtTime(hover.start_at)} → {hover.end_at ? fmtTime(hover.end_at) : "进行中"}
          </span>
          {hover.duration_seconds != null && (
            <>
              <span className="mx-2 text-slate-400">·</span>
              <span>{fmtDuration(hover.duration_seconds)}</span>
            </>
          )}
          <span className="mx-2 text-slate-400">·</span>
          <span>{statusLabel(hover)}</span>
        </div>
      )}
    </div>
  );
}

function HourLabels(): React.JSX.Element {
  const cells = [];
  for (let h = 0; h < HOURS; h++) {
    // 24+ 显示次日 0-8（24→0, 25→1, ..., 32→8）+1d 标记
    const isNextDay = h >= 24;
    const label = isNextDay ? `${String(h - 24).padStart(2, "0")}+1` : String(h).padStart(2, "0");
    cells.push(
      <div
        key={h}
        className={`border-r border-slate-200 text-[10.5px] text-center tabular-nums ${isNextDay ? "text-slate-400 bg-slate-50/60" : "text-slate-500"}`}
        style={{ width: `${100 / HOURS}%`, lineHeight: `${HOUR_LABEL_HEIGHT}px` }}
      >
        {label}
      </div>,
    );
  }
  return <>{cells}</>;
}

function AccountRow({
  account,
  dayIso,
  nowMs,
  onHover,
}: {
  account: CheckinDayResult["accounts"][number];
  dayIso: string;
  nowMs: number;
  onHover: (s: CheckinDaySession | null) => void;
}): React.JSX.Element {
  return (
    <div className="flex border-b border-slate-100" style={{ height: `${ROW_HEIGHT}px` }}>
      {/* Left axis */}
      <div
        className="shrink-0 flex items-center gap-2 px-3 border-r border-slate-200 bg-slate-50/40"
        style={{ width: `${LEFT_AXIS_WIDTH}px` }}
      >
        {account.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={account.avatar}
            alt=""
            className="h-5 w-5 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="h-5 w-5 rounded-full bg-slate-200" />
        )}
        <span
          className="truncate text-[12px] font-medium text-slate-700"
          title={account.placement_label ?? undefined}
        >
          {account.account_name}
        </span>
      </div>

      {/* Gantt area */}
      <GanttArea sessions={account.sessions} dayIso={dayIso} nowMs={nowMs} onHover={onHover} />
    </div>
  );
}

function GanttArea({
  sessions,
  dayIso,
  nowMs,
  onHover,
}: {
  sessions: CheckinDaySession[];
  dayIso: string;
  nowMs: number;
  onHover: (s: CheckinDaySession | null) => void;
}): React.JSX.Element {
  return (
    <div className="relative flex-1">
      {/* hour grid lines + 跨日分割线 24h 处加粗 */}
      {Array.from({ length: HOURS - 1 }, (_, i) => i + 1).map((h) => (
        <div
          key={h}
          className={`absolute inset-y-0 ${h === 24 ? "border-l-2 border-slate-300" : "border-l border-slate-100"}`}
          style={{ left: `${(h / HOURS) * 100}%` }}
        />
      ))}
      {/* sessions */}
      {sessions.map((s) => {
        const proj = projectSession(s, dayIso, 1 / HOURS, nowMs); // 用百分比
        if (!proj.visible) return null;
        const c = statusColor(s);
        return (
          <button
            key={s.session_id}
            type="button"
            onMouseEnter={() => onHover(s)}
            onMouseLeave={() => onHover(null)}
            className={`absolute top-1 bottom-1 rounded ${c.bar} border-l-2 ${c.border} pl-1.5 text-[10.5px] font-medium ${c.text} whitespace-nowrap text-left hover:shadow-sm hover:z-10 transition-shadow`}
            style={{
              left: `${proj.left * 100}%`,
              width: `calc(${proj.width * 100}% - 2px)`,
              minWidth: "3px",
              // 允许名字溢出到右侧空白（生产场景每场 3h+ 不会跟相邻条重叠）
              overflow: "visible",
            }}
            title={`${s.anchor_name} · ${fmtTime(s.start_at)}→${s.end_at ? fmtTime(s.end_at) : "进行中"} · ${statusLabel(s)}${
              s.status !== "in_progress" && s.income_cents !== null
                ? ` · 礼物 ${(s.income_cents / 100).toFixed(1)} 元`
                : ""
            }`}
          >
            <b className="font-semibold">{s.anchor_name}</b>
            {s.status !== "in_progress" && s.income_cents !== null && s.income_cents > 0 && (
              <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] opacity-80">
                <Gift className="h-2.5 w-2.5" strokeWidth={2.2} />
                <span className="tabular-nums">{fmtGift(s.income_cents)}</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Legend(): React.JSX.Element {
  const items = [
    { color: "bg-emerald-100 border-emerald-500", label: "正常下播" },
    { color: "bg-orange-100 border-orange-500", label: "被接班" },
    { color: "bg-red-100 border-red-500", label: "系统检测离线" },
    { color: "bg-blue-100 border-blue-500", label: "进行中" },
  ];
  return (
    <div className="flex items-center gap-4 border-t border-slate-100 bg-slate-50/40 px-4 py-2 text-[11px] text-slate-500">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span className={`inline-block h-3 w-5 border-l-2 rounded ${it.color}`} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
