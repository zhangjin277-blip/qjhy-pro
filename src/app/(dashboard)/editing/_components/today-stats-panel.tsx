"use client";
import type { TodaySummary, TodayEditorLoad, FishCoverage } from "@/modules/editing-task";
import { FishCoveragePanel } from "./fish-coverage-panel";

interface Props {
  summary: TodaySummary;
  editorLoad: TodayEditorLoad[];
  fishCoverage: FishCoverage;
}

export function TodayStatsPanel({ summary, editorLoad, fishCoverage }: Props) {
  const kpis = [
    { label: "上传", value: summary.uploadedToday },
    { label: "派单", value: summary.assignedToday },
    { label: "审核", value: summary.reviewToday },
    { label: "通过", value: summary.approvedToday },
    { label: "发布", value: summary.publishedToday },
  ];

  return (
    <div className="space-y-3">
      {/* 今日汇总：横向 KPI 条 */}
      <section className="flex rounded-xl border border-border-subtle bg-white">
        {kpis.map((k, i) => (
          <div
            key={k.label}
            className={`flex-1 py-3 text-center ${
              i < kpis.length - 1 ? "border-r border-border-subtle" : ""
            }`}
          >
            <div className="text-2xl font-bold tabular-nums text-slate-900">{k.value}</div>
            <div className="mt-1 text-[11.5px] text-slate-500">{k.label}</div>
          </div>
        ))}
      </section>

      {/* 剪辑师负载 + 今日完成度 并排 */}
      <div className="flex flex-col gap-3 lg:flex-row">
        <section className="rounded-xl border border-border-subtle bg-white p-3 lg:w-[300px] lg:shrink-0">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            剪辑师负载
          </h3>
          {editorLoad.length === 0 ? (
            <p className="text-xs text-slate-400">该时段暂无派单</p>
          ) : (
            <div className="space-y-1.5">
              {editorLoad.map((e) => {
                // 进度条 = 审核通过 / 派单（完成口径=审核通过）
                const pct = e.assigned > 0 ? Math.round((e.approved / e.assigned) * 100) : 0;
                const backlog = e.submitted - e.approved; // 交片了但还没审核通过的积压
                return (
                  <div key={e.editorUserId} className="flex items-center gap-2 text-[12.5px]">
                    <span className="min-w-[54px] truncate font-medium text-slate-700">
                      {e.editorName}
                    </span>
                    <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span
                        className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-[#5aa2ff] to-[var(--primary)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="min-w-[128px] text-right text-[11.5px] tabular-nums text-slate-500">
                      派 {e.assigned} · 交片 {e.submitted} · 通过 {e.approved}
                      {backlog > 0 && (
                        <span className="ml-1 text-[var(--change-up)]">积压{backlog}</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="min-w-0 flex-1">
          <FishCoveragePanel coverage={fishCoverage} />
        </div>
      </div>
    </div>
  );
}
