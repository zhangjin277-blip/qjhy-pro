"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import {
  PROJECT_LABELS,
  type DashboardOverviewResponse,
  type GroupCellValue,
  type GroupKey,
  type ProjectBreakdown,
  type ProjectKey,
  type Section2Metric,
} from "@/modules/dashboard";
import { formatVsPrevRatio, getAbsoluteChange, splitChineseNumber } from "./format";

type CompareMode = "percent" | "absolute";

const METRIC_DEFS: { id: Section2Metric; label: string }[] = [
  { id: "flow", label: "流水" },
  { id: "live_flow", label: "直播流水" },
  { id: "video_flow", label: "短视频流水" },
  { id: "total_fan_ticket", label: "音浪" },
  { id: "install_or_activate", label: "安装 / 激活" },
  { id: "show_uv", label: "曝光人数" },
  { id: "watch_uv", label: "进房人数" },
  { id: "active_anchor_count", label: "开播主播" },
  { id: "new_anchor_count", label: "新入驻" },
  { id: "first_live_anchor_count", label: "首次开播" },
];

const PROJECT_META: Record<ProjectKey, { label: string; category: string; color: string }> = {
  ddz: { label: PROJECT_LABELS.ddz, category: "棋牌系", color: "#c49a45" },
  three: { label: PROJECT_LABELS.three, category: "SLG", color: "#8b5cf6" },
  zhaohua: { label: PROJECT_LABELS.zhaohua, category: "仙侠", color: "#0f9f8f" },
};

const GROUPS: { key: GroupKey; label: string; color?: string }[] = [
  { key: "all", label: "总计" },
  { key: "online", label: "线上", color: "#1677ff" },
  { key: "offline", label: "线下", color: "#ff7d00" },
  { key: "other", label: "其他", color: "#a9b0bc" },
];

export interface BreakdownClick {
  metric: Section2Metric;
  project: ProjectKey;
  group: GroupKey;
}

function isAnchorCountMetric(metric: Section2Metric): boolean {
  return (
    metric === "active_anchor_count" ||
    metric === "new_anchor_count" ||
    metric === "first_live_anchor_count"
  );
}

function isPersonMetric(metric: Section2Metric): boolean {
  return (
    isAnchorCountMetric(metric) ||
    metric === "install_or_activate" ||
    metric === "show_uv" ||
    metric === "watch_uv"
  );
}

function formatMetricValue(metric: Section2Metric, value: number): string {
  if (isAnchorCountMetric(metric)) return `${value.toLocaleString("zh-CN")} 人`;
  const formatted = splitChineseNumber(value);
  if (isPersonMetric(metric)) {
    return `${formatted.body}${formatted.unit ? ` ${formatted.unit}` : ""} 人`;
  }
  return `${formatted.body}${formatted.unit ? ` ${formatted.unit}` : ""}`;
}

function metricLabel(metric: Section2Metric, project: ProjectKey): string {
  if (metric === "install_or_activate") return project === "ddz" ? "安装" : "激活";
  return METRIC_DEFS.find((item) => item.id === metric)?.label ?? metric;
}

function emptyProject(project: ProjectKey): ProjectBreakdown {
  const cell = (group: GroupKey): GroupCellValue => ({
    project,
    group,
    value: 0,
    prev_value: null,
    vs_prev: null,
    anchor_count: 0,
    sparkline: [],
  });
  return {
    project,
    total: cell("all"),
    online: cell("online"),
    offline: cell("offline"),
    other: cell("other"),
  };
}

function MetricCell({
  cell,
  metric,
  project,
  group,
  compareMode,
  onClick,
}: {
  cell: GroupCellValue;
  metric: Section2Metric;
  project: ProjectKey;
  group: GroupKey;
  compareMode: CompareMode;
  onClick: (payload: BreakdownClick) => void;
}): React.JSX.Element {
  const notApplicable = cell.not_applicable === true;
  const vs = formatVsPrevRatio(cell.vs_prev);
  const absolute = getAbsoluteChange(cell.value, cell.prev_value);
  const compare =
    compareMode === "percent"
      ? vs
      : {
          kind: absolute.kind,
          text:
            absolute.value === null
              ? "—"
              : absolute.kind === "flat"
                ? "持平"
                : `${absolute.kind === "up" ? "↑" : "↓"}${formatMetricValue(metric, Math.abs(absolute.value))}`,
        };
  return (
    <button
      type="button"
      disabled={notApplicable}
      onClick={() => onClick({ metric, project, group })}
      className={cn(
        "group/cell flex min-h-14 w-full flex-col justify-center px-3 py-2 text-left transition-colors",
        "hover:bg-[#f3f6ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
        group === "all" && "bg-[#fafbfe]",
        notApplicable && "cursor-not-allowed text-[#98a2b3] hover:bg-transparent",
      )}
      aria-label={`${PROJECT_META[project].label} ${GROUPS.find((item) => item.key === group)?.label} ${metricLabel(metric, project)}详情`}
    >
      <span
        className={cn(
          "whitespace-nowrap text-[13px] font-semibold tabular-nums text-[#1d2129]",
          group === "all" && "text-[14px]",
          notApplicable && "text-[#98a2b3]",
        )}
      >
        {notApplicable ? "—" : formatMetricValue(metric, cell.value)}
      </span>
      <span
        className={cn(
          "mt-0.5 text-[10.5px] font-medium tabular-nums text-[#667085]",
          compare.kind === "up" && "text-change-up",
          compare.kind === "down" && "text-change-down",
        )}
      >
        {notApplicable ? "不适用" : compare.text}
      </span>
    </button>
  );
}

function ProjectMatrix({
  project,
  rows,
  loading,
  compareMode,
  onCellClick,
}: {
  project: ProjectKey;
  rows: DashboardOverviewResponse["breakdown"];
  loading: boolean;
  compareMode: CompareMode;
  onCellClick: (payload: BreakdownClick) => void;
}): React.JSX.Element {
  const meta = PROJECT_META[project];
  const fallback = emptyProject(project);
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-[#e8ebf2] bg-white">
      <div className="flex items-center gap-2 border-b border-[#e8ebf2] px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: meta.color }} />
        <h3 className="text-[14px] font-semibold text-[#1d2129]">{meta.label}</h3>
        <span className="rounded bg-[#f3f5fb] px-1.5 py-0.5 text-[10.5px] text-[#667085]">
          {meta.category}
        </span>
        <span className="ml-auto text-[11px] text-[#667085]">
          数值 / {compareMode === "percent" ? "百分比" : "差值"}
        </span>
      </div>

      <div className="overflow-x-auto overscroll-x-contain">
        <div className="min-w-[620px]">
          <div className="grid grid-cols-[132px_repeat(4,minmax(110px,1fr))] border-b border-[#e8ebf2] bg-[#f8f9fc]">
            <div className="sticky left-0 z-20 bg-[#f8f9fc] px-4 py-2 text-[11px] font-medium text-[#667085] shadow-[1px_0_0_#edf0f5]">
              指标
            </div>
            {GROUPS.map((group) => (
              <div
                key={group.key}
                className="flex items-center gap-1.5 border-l border-[#edf0f5] px-3 py-2 text-[11px] font-medium text-[#4e5969]"
              >
                {group.color ? (
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: group.color }} />
                ) : null}
                {group.label}
              </div>
            ))}
          </div>

          {METRIC_DEFS.map((definition) => {
            const row = rows.find((item) => item.metric === definition.id)?.[project] ?? fallback;
            return (
              <div
                key={definition.id}
                className="grid grid-cols-[132px_repeat(4,minmax(110px,1fr))] border-b border-[#edf0f5] last:border-b-0"
              >
                <div className="sticky left-0 z-10 flex items-center bg-white px-4 py-2 text-[12px] font-medium text-[#4e5969] shadow-[1px_0_0_#edf0f5]">
                  {metricLabel(definition.id, project)}
                </div>
                {GROUPS.map((group) => (
                  <div key={group.key} className="border-l border-[#edf0f5]">
                    <MetricCell
                      cell={group.key === "all" ? row.total : row[group.key]}
                      metric={definition.id}
                      project={project}
                      group={group.key}
                      compareMode={compareMode}
                      onClick={onCellClick}
                    />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      {loading ? (
        <div className="border-t border-[#edf0f5] px-4 py-2 text-[11px] text-[#667085]">
          正在更新数据…
        </div>
      ) : null}
    </div>
  );
}

export function BreakdownSection({
  data,
  loading,
  singleDay,
  onCellClick,
}: {
  data: DashboardOverviewResponse | null;
  loading: boolean;
  singleDay: boolean;
  onCellClick: (payload: BreakdownClick) => void;
}): React.JSX.Element {
  const [compareMode, setCompareMode] = useState<CompareMode>("percent");
  const rows = data?.breakdown ?? [];
  const compareLabel = singleDay ? "较前一日" : "较上一周期";
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2 px-1">
        <div>
          <h2 className="text-[15px] font-semibold text-[#1d2129]">业务细分</h2>
          <p className="mt-0.5 text-[11.5px] text-[#667085]">
            同屏查看全部指标，点击数值可下钻主播明细
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#667085]">{compareLabel}</span>
          <div
            className="flex rounded-md bg-[#e9edf5] p-0.5 text-[11px]"
            role="group"
            aria-label="涨跌展示方式"
          >
            {(
              [
                ["percent", "百分比"],
                ["absolute", "差值"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={compareMode === mode}
                onClick={() => setCompareMode(mode)}
                className={cn(
                  "rounded px-2.5 py-1 transition-colors",
                  compareMode === mode
                    ? "bg-white font-medium text-[#1d2129] shadow-sm"
                    : "text-[#667085] hover:text-[#344054]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 2xl:grid-cols-3">
        <ProjectMatrix
          project="ddz"
          rows={rows}
          loading={loading}
          compareMode={compareMode}
          onCellClick={onCellClick}
        />
        <ProjectMatrix
          project="three"
          rows={rows}
          loading={loading}
          compareMode={compareMode}
          onCellClick={onCellClick}
        />
        <ProjectMatrix
          project="zhaohua"
          rows={rows}
          loading={loading}
          compareMode={compareMode}
          onCellClick={onCellClick}
        />
      </div>
    </section>
  );
}
