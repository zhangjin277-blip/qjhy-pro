"use client";
import { useRouter } from "next/navigation";
import type {
  StatusCounts,
  EditorMonthlyStat,
  AnchorMonthlyCoverage,
} from "@/modules/editing-task";
import { ViewTabs } from "./view-tabs";

interface Props {
  monthOffset: number;
  monthLabel: string;
  statusCounts: StatusCounts;
  editorStats: EditorMonthlyStat[];
  anchorCoverage: AnchorMonthlyCoverage[];
}

const STATUS_LABEL: Record<keyof StatusCounts, { label: string; color: string }> = {
  uploaded: { label: "待剪辑", color: "bg-blue-50 text-blue-600" },
  editing: { label: "剪辑中", color: "bg-amber-50 text-amber-600" },
  review: { label: "审核", color: "bg-purple-50 text-purple-600" },
  ready: { label: "待发布", color: "bg-cyan-50 text-cyan-600" },
  published: { label: "已发布", color: "bg-green-50 text-green-600" },
};

export function StatsView({
  monthOffset,
  monthLabel,
  statusCounts,
  editorStats,
  anchorCoverage,
}: Props) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      {/* 顶部：视图切换 + 月份选择 */}
      <div className="flex items-center justify-between">
        <ViewTabs active="stats" />

        {/* 月份切换 */}
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => router.push(`?m=${monthOffset - 1}`)}
            className="rounded p-1 hover:bg-slate-100"
          >
            ‹
          </button>
          <span className="min-w-[80px] text-center font-medium">{monthLabel}</span>
          <button
            onClick={() => router.push(`?m=${monthOffset + 1}`)}
            className="rounded p-1 hover:bg-slate-100"
          >
            ›
          </button>
          {monthOffset !== 0 && (
            <button
              onClick={() => router.push("?m=0")}
              className="ml-1 text-blue-600 hover:underline"
            >
              本月
            </button>
          )}
        </div>
      </div>

      {/* 状态卡片（实时，不受月份影响） */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-500">当前状态分布</h2>
        <div className="grid grid-cols-5 gap-3">
          {(Object.keys(STATUS_LABEL) as (keyof StatusCounts)[]).map((s) => (
            <div key={s} className="rounded-xl border border-border bg-white p-4 shadow-sm">
              <div
                className={`inline-block rounded-full px-2 py-0.5 text-xs ${STATUS_LABEL[s].color}`}
              >
                {STATUS_LABEL[s].label}
              </div>
              <div className="mt-2 text-2xl font-bold tabular-nums">{statusCounts[s]}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 剪辑师月度统计 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-500">
          剪辑师月度统计（{monthLabel}）
        </h2>
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-500">剪辑师</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-500">
                  完成数（交片）
                </th>
                <th className="px-4 py-3 text-right font-semibold text-slate-500">被回退</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-500">回退率</th>
              </tr>
            </thead>
            <tbody>
              {editorStats.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-400">
                    本月暂无数据
                  </td>
                </tr>
              ) : (
                editorStats.map((e) => (
                  <tr key={e.editorUserId} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{e.editorName}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{e.completed}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-600">
                      {e.rejected}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {(e.rejectionRate * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 主播月度上传覆盖度（基于开播记录，只算捕鱼系） */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-slate-500">
          主播月度上传覆盖度（{monthLabel}）
        </h2>
        <p className="mb-3 text-[11px] text-slate-400">
          基于开播记录：每开播 1 天应上传 1 条素材。应上传 = 开播天数；实际 =
          有合格素材的开播日；只算捕鱼系。
        </p>
        {anchorCoverage.length === 0 ? (
          <div className="rounded-xl border border-border bg-white py-8 text-center text-sm text-slate-400">
            本月暂无开播记录
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {[...anchorCoverage]
              .sort((a, b) => b.missing - a.missing || b.expected - a.expected)
              .map((a) => {
                const pct = Math.round(a.coverageRate * 100);
                const color = pct >= 100 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#ef4444";
                return (
                  <div
                    key={a.anchorId}
                    className="flex items-center gap-3 rounded-xl border border-border-subtle bg-white p-2.5"
                  >
                    {/* 进度环 */}
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
                      style={{ background: `conic-gradient(${color} ${pct}%, #eceff5 0)` }}
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white">
                        <span className="text-[11px] font-bold tabular-nums" style={{ color }}>
                          {pct}%
                        </span>
                      </div>
                    </div>
                    {/* 信息 */}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-slate-800">
                        {a.anchorName}
                      </div>
                      <div className="truncate text-[10.5px] text-slate-400">{a.products}</div>
                      <div className="mt-0.5 text-[11.5px] tabular-nums text-slate-500">
                        应 {a.expected} · 实 <b className="text-green-600">{a.uploaded}</b>
                        {a.missing > 0 && (
                          <span className="text-[var(--change-up)]"> · 欠 {a.missing}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </section>
    </div>
  );
}
