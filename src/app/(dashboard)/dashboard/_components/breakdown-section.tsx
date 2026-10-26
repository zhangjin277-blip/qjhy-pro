"use client";

import { Fragment, useState } from "react";
import { ChevronRight } from "lucide-react";
import { PresetChip, PresetToolbar } from "@/components/patterns/preset-toolbar";
import styles from "./business-board.module.css";
import { cn } from "@/lib/utils/cn";
import {
  PROJECT_LABELS,
  type DashboardOverviewResponse,
  type GroupCellValue,
  type GroupKey,
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
  if (metric === "install_or_activate") return project === "three" ? "激活" : "安装";
  return METRIC_DEFS.find((item) => item.id === metric)?.label ?? metric;
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
      className={cn(styles.metricButton, group === "all" && styles.totalMetric)}
      aria-label={`${PROJECT_META[project].label} ${GROUPS.find((item) => item.key === group)?.label} ${metricLabel(metric, project)}详情`}
    >
      <span className={styles.metricNumber}>
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
  const [expanded, setExpanded] = useState<ProjectKey[]>([]);
  function toggle(project: ProjectKey) {
    setExpanded((current) =>
      current.includes(project) ? current.filter((key) => key !== project) : [...current, project],
    );
  }
  const projects: ProjectKey[] = ["ddz", "three", "zhaohua"];
  return (
    <section className={styles.panel} aria-label="项目对比">
      <header className={styles.panelHeader}>
        <div>
          <h2>
            <i />
            项目对比
          </h2>
          <p>全部 10 项指标同屏对比，展开项目查看线上 / 线下 / 其他</p>
        </div>
        <div className={styles.tableTools}>
          <span>{singleDay ? "较前一日" : "较上一周期"}</span>
          <PresetToolbar label={null}>
            {(
              [
                ["percent", "百分比"],
                ["absolute", "差值"],
              ] as const
            ).map(([mode, label]) => (
              <PresetChip
                key={mode}
                active={compareMode === mode}
                onClick={() => setCompareMode(mode)}
              >
                {label}
              </PresetChip>
            ))}
          </PresetToolbar>
        </div>
      </header>
      <div
        className={styles.tableScroll}
        tabIndex={0}
        role="region"
        aria-label="项目指标对比表，可横向滚动"
      >
        <table className={styles.matrix}>
          <colgroup>
            <col className={styles.projectColumn} />
            {METRIC_DEFS.map((metric) => (
              <col key={metric.id} />
            ))}
          </colgroup>
          <thead>
            <tr className={styles.groupHead}>
              <th scope="col" rowSpan={2}>
                项目 / 分组
              </th>
              <th scope="colgroup" colSpan={4}>
                经营表现
              </th>
              <th scope="colgroup" colSpan={3}>
                用户转化
              </th>
              <th scope="colgroup" colSpan={3}>
                主播增长
              </th>
            </tr>
            <tr>
              {METRIC_DEFS.map((metric) => (
                <th scope="col" key={metric.id}>
                  {metric.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <Fragment key={project}>
                {["all", ...(expanded.includes(project) ? ["online", "offline", "other"] : [])].map(
                  (key) => {
                    const group = key as GroupKey;
                    const meta = PROJECT_META[project];
                    return (
                      <tr key={group} className={group !== "all" ? styles.detailRow : undefined}>
                        <th scope="row" className={styles.projectCell}>
                          {group === "all" ? (
                            <>
                              <div className={styles.projectName}>
                                <i style={{ background: meta.color }} />
                                {meta.label}
                              </div>
                              <div className={styles.projectSub}>
                                <span>{meta.category}</span>
                                <button
                                  type="button"
                                  aria-expanded={expanded.includes(project)}
                                  aria-label={`${meta.label}${expanded.includes(project) ? "收起" : "展开"}分组`}
                                  onClick={() => toggle(project)}
                                >
                                  <ChevronRight size={12} />
                                  {expanded.includes(project) ? "收起分组" : "展开分组"}
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className={styles.groupName}>
                              <i
                                style={{
                                  background: GROUPS.find((item) => item.key === group)?.color,
                                }}
                              />
                              {GROUPS.find((item) => item.key === group)?.label}
                            </div>
                          )}
                        </th>
                        {METRIC_DEFS.map((metric) => {
                          const row = data?.breakdown.find((item) => item.metric === metric.id)?.[
                            project
                          ];
                          const cell = group === "all" ? row?.total : row?.[group];
                          return (
                            <td key={metric.id}>
                              {cell ? (
                                <MetricCell
                                  cell={cell}
                                  metric={metric.id}
                                  project={project}
                                  group={group}
                                  compareMode={compareMode}
                                  onClick={onCellClick}
                                />
                              ) : (
                                <span className={styles.missing}>{loading ? "加载中" : "—"}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  },
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <footer className={styles.tableFooter}>
        <span>点击数值查看主播明细 · 三国冰河时代短视频流水不适用</span>
        <span>安装 / 激活口径随项目</span>
      </footer>
    </section>
  );
}
