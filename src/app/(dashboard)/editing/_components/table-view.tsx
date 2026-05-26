"use client";
import type { BoardCard } from "@/modules/editing-task";
import { formatDwellTime, dwellSeverity } from "../_lib/dwell";
import { ViewTabs } from "./view-tabs";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  uploaded: { label: "待剪辑", color: "bg-blue-50 text-blue-600" },
  editing: { label: "剪辑中", color: "bg-amber-50 text-amber-600" },
  review: { label: "审核", color: "bg-purple-50 text-purple-600" },
  ready: { label: "待发布", color: "bg-cyan-50 text-cyan-600" },
  published: { label: "已发布", color: "bg-green-50 text-green-600" },
};

interface Props {
  rows: BoardCard[];
}

export function TableView({ rows }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <ViewTabs active="table" />
      <div className="overflow-x-auto rounded-xl border border-border-subtle bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">账号</th>
              <th className="px-4 py-3 text-left font-semibold">主播</th>
              <th className="px-4 py-3 text-left font-semibold">产品</th>
              <th className="px-4 py-3 text-left font-semibold">状态</th>
              <th className="px-4 py-3 text-left font-semibold">剪辑师</th>
              <th className="px-4 py-3 text-left font-semibold">素材日期</th>
              <th className="px-4 py-3 text-right font-semibold">停留时长</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  暂无数据
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const sev = dwellSeverity(r.enteredStatusAt);
                const dwellClass =
                  sev === "danger"
                    ? "text-red-500 font-semibold"
                    : sev === "warn"
                      ? "text-amber-600 font-medium"
                      : "text-slate-500";
                const st = STATUS_LABEL[r.status] ?? { label: r.status, color: "bg-slate-100" };
                return (
                  <tr
                    key={r.id}
                    className="border-t border-border-subtle hover:bg-[var(--selection-bg)]"
                  >
                    <td className="px-4 py-3 font-medium">{r.liveAccountName}</td>
                    <td className="px-4 py-3 text-slate-600">{r.anchorName ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className="rounded px-1.5 py-0.5 text-[11px]"
                        style={{
                          backgroundColor: `${r.productAccentColor}1a`,
                          color: r.productAccentColor,
                        }}
                      >
                        {r.product}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.color}`}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.editorName ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-500">{r.materialDate}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${dwellClass}`}>
                      {formatDwellTime(r.enteredStatusAt)}
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
