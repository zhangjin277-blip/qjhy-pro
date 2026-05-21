"use client";

import type { CheckinDayResult, CheckinDaySession } from "@/modules/checkin/queries";

interface Props {
  data: CheckinDayResult;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtDuration(sec: number | null): string {
  if (sec == null) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h${m}m`;
  return `${m}m`;
}

function statusBadge(s: CheckinDaySession): { text: string; cls: string } {
  if (s.status === "in_progress") return { text: "进行中", cls: "bg-blue-100 text-blue-800" };
  if (s.status === "ended") return { text: "正常下播", cls: "bg-emerald-100 text-emerald-800" };
  if (s.status === "auto_closed_by_next")
    return { text: "被接班", cls: "bg-orange-100 text-orange-800" };
  if (s.status === "auto_closed_by_offline")
    return { text: "系统检测离线", cls: "bg-red-100 text-red-800" };
  if (s.status === "auto_closed_by_cron")
    return { text: "系统兜底", cls: "bg-slate-200 text-slate-700" };
  return { text: s.status, cls: "bg-slate-100 text-slate-600" };
}

interface FlatRow {
  product: string;
  placement_label: string | null;
  account_name: string;
  platform: string;
  avatar: string | null;
  session: CheckinDaySession;
}

export function CheckinTable({ data }: Props): React.JSX.Element {
  const flat: FlatRow[] = [];
  for (const acc of data.accounts) {
    for (const s of acc.sessions) {
      flat.push({
        product: acc.product,
        placement_label: acc.placement_label,
        account_name: acc.account_name,
        platform: acc.platform,
        avatar: acc.avatar,
        session: s,
      });
    }
  }
  // 按 start_at 倒序
  flat.sort((a, b) => (a.session.start_at < b.session.start_at ? 1 : -1));

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-slate-100 px-4 py-2 text-[12.5px] font-semibold text-slate-700">
        详细记录{" "}
        <span className="text-[11px] font-normal text-slate-400">
          · {flat.length} 条 · 按开始时间倒序
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] min-w-[900px]">
          <thead className="bg-slate-50 text-[10.5px] font-medium text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 text-left">主播</th>
              <th className="px-3 py-2 text-left">账号</th>
              <th className="px-3 py-2 text-left">产品</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">开始</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">结束</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">时长</th>
              <th className="px-3 py-2 text-left">状态</th>
            </tr>
          </thead>
          <tbody>
            {flat.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                  暂无记录
                </td>
              </tr>
            ) : (
              flat.map((r) => {
                const badge = statusBadge(r.session);
                return (
                  <tr
                    key={r.session.session_id}
                    className="border-t border-slate-100 hover:bg-slate-50/60"
                  >
                    <td className="px-3 py-2 font-medium text-slate-800">
                      {r.session.anchor_name}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-purple-50 px-1.5 text-[10.5px] text-purple-700">
                          {r.placement_label ?? "—"}
                        </span>
                        <span className="text-slate-500 truncate max-w-[180px]">
                          {r.account_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{r.product}</td>
                    <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap tabular-nums">
                      {fmtTime(r.session.start_at)}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap tabular-nums">
                      {r.session.end_at ? fmtTime(r.session.end_at) : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap tabular-nums">
                      {fmtDuration(r.session.duration_seconds)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}
                      >
                        {badge.text}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
