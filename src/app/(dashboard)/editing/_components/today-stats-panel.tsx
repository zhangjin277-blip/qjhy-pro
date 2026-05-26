"use client";
import type {
  TodaySummary,
  TodayAnchorDist,
  TodayEditorLoad,
  FishCoverage,
} from "@/modules/editing-task";
import { FishCoveragePanel } from "./fish-coverage-panel";

interface Props {
  summary: TodaySummary;
  anchorDist: TodayAnchorDist[];
  editorLoad: TodayEditorLoad[];
  fishCoverage: FishCoverage;
}

export function TodayStatsPanel({ summary, anchorDist, editorLoad, fishCoverage }: Props) {
  return (
    <div className="grid grid-cols-12 gap-3">
      {/* 今日汇总 - 5 列 */}
      <section className="col-span-12 rounded-xl border border-border-subtle bg-white p-3 lg:col-span-5">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          今日汇总
        </h3>
        <div className="grid grid-cols-5 gap-2">
          <Stat label="上传" value={summary.uploadedToday} color="text-blue-600" />
          <Stat label="派单" value={summary.assignedToday} color="text-amber-600" />
          <Stat label="审核" value={summary.reviewToday} color="text-purple-600" />
          <Stat label="通过" value={summary.approvedToday} color="text-cyan-600" />
          <Stat label="发布" value={summary.publishedToday} color="text-green-600" />
        </div>
      </section>

      {/* 剪辑师负载 - 4 列 */}
      <section className="col-span-12 rounded-xl border border-border-subtle bg-white p-3 lg:col-span-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          剪辑师负载
        </h3>
        {editorLoad.length === 0 ? (
          <p className="text-xs text-slate-400">今日暂无派单</p>
        ) : (
          <div className="max-h-32 space-y-1 overflow-auto text-xs">
            {editorLoad.map((e) => (
              <div key={e.editorUserId} className="flex justify-between">
                <span className="font-medium">{e.editorName}</span>
                <span className="text-slate-500">
                  派 <b className="text-amber-600">{e.assigned}</b> · 完成{" "}
                  <b className="text-green-600">{e.completed}</b>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 主播分布 - 3 列 */}
      <section className="col-span-12 rounded-xl border border-border-subtle bg-white p-3 lg:col-span-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          主播分布
        </h3>
        {anchorDist.length === 0 ? (
          <p className="text-xs text-slate-400">今日暂无任务</p>
        ) : (
          <div className="flex max-h-32 flex-wrap gap-1 overflow-auto">
            {anchorDist.map((a, i) => (
              <span
                key={`${a.anchorId ?? "none"}-${a.product}-${i}`}
                className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
                title={`${a.product} · ${a.anchorName}`}
              >
                {a.anchorName} <b className="text-blue-600">×{a.count}</b>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* 捕鱼今日完成度（跨整行） */}
      <div className="col-span-12">
        <FishCoveragePanel coverage={fishCoverage} />
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
