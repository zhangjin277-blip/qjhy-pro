"use client";
import { useRouter } from "next/navigation";
import type { StatusCounts, EditorMonthlyStat, AnchorMonthlyStat } from "@/modules/editing-task";
import { ViewTabs } from "./view-tabs";

interface Props {
  monthOffset: number;
  monthLabel: string;
  statusCounts: StatusCounts;
  editorStats: EditorMonthlyStat[];
  anchorStats: AnchorMonthlyStat[];
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
  anchorStats,
}: Props) {
  const router = useRouter();

  return (
    <div className="p-6 space-y-8">
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
                <th className="px-4 py-3 text-right font-semibold text-slate-500">完成数</th>
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

      {/* 主播月度统计 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-500">主播月度统计（{monthLabel}）</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-500">主播</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-500">总任务</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-500">待剪辑</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-500">剪辑中</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-500">审核/待发布</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-500">已发布</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-500">完成率</th>
              </tr>
            </thead>
            <tbody>
              {anchorStats.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    本月暂无数据
                  </td>
                </tr>
              ) : (
                anchorStats.map((a) => (
                  <tr key={a.anchorId} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{a.anchorName}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{a.total}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{a.uploaded}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{a.editing}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{a.review + a.ready}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-green-600">
                      {a.published}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {(a.completionRate * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
