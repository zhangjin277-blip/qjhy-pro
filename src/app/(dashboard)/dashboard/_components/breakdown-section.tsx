"use client";

import { cn } from "@/lib/utils/cn";
import type {
  DashboardOverviewResponse,
  GroupCellValue,
  GroupKey,
  ProjectBreakdown,
  ProjectKey,
  Section2Metric,
} from "@/modules/dashboard";
import {
  formatChineseNumber,
  formatTotalLine,
  formatVsPrevRatio,
  splitChineseNumber,
} from "./format";
import { Sparkline } from "./sparkline";

type BreakdownItem = DashboardOverviewResponse["breakdown"][number];

const METRIC_TABS: { id: Section2Metric; label: string }[] = [
  { id: "total_fan_ticket", label: "音浪" },
  { id: "flow", label: "流水" },
  { id: "active_anchor_count", label: "开播主播数" },
  { id: "new_anchor_count", label: "新入驻主播数" },
  { id: "first_live_anchor_count", label: "首次开播主播数" },
  { id: "live_flow", label: "直播流水" },
  { id: "video_flow", label: "短视频流水" },
  { id: "install_or_activate", label: "安装/激活" },
  { id: "show_uv", label: "曝光" },
  { id: "watch_uv", label: "进直播间UV" },
];

const PROJECT_LABEL: Record<ProjectKey, string> = {
  ddz: "斗地主",
  three: "三国",
};

/** 按钮 onClick 标识 */
export interface BreakdownClick {
  metric: Section2Metric;
  project: ProjectKey;
  group: GroupKey;
}

/** 主播数类（数量级小，不需缩写）*/
function isAnchorCountMetric(metric: Section2Metric): boolean {
  return (
    metric === "active_anchor_count" ||
    metric === "new_anchor_count" ||
    metric === "first_live_anchor_count"
  );
}

/** 大数量「人」类（曝光/UV/安装·激活，需要缩写到万）*/
function isLargePersonMetric(metric: Section2Metric): boolean {
  return metric === "install_or_activate" || metric === "show_uv" || metric === "watch_uv";
}

function splitForMetric(metric: Section2Metric, value: number): { body: string; unit: string } {
  if (isAnchorCountMetric(metric)) {
    // 「开播主播数 / 新入驻主播数」数小，直接显示
    return { body: value.toLocaleString("zh-CN"), unit: "人" };
  }
  if (isLargePersonMetric(metric)) {
    // 「曝光 / 进直播间UV / 安装·激活」大数字缩写 + 「人」
    const split = splitChineseNumber(value);
    return { body: split.body, unit: split.unit ? `${split.unit} 人` : "人" };
  }
  // 音浪 / 各类流水：缩写到万/亿，无「人」单位
  return splitChineseNumber(value);
}

/**
 * install_or_activate 在 ddz cell 显示「安装」、在 three 显示「激活」；
 * 其他 metric 用 METRIC_TABS 的 label
 */
function metricLabelForCell(metric: Section2Metric, project: ProjectKey): string {
  if (metric === "install_or_activate") {
    return project === "ddz" ? "安装" : "激活";
  }
  const tab = METRIC_TABS.find((t) => t.id === metric);
  return tab?.label ?? metric;
}

/**
 * 单格（项目 × 分组）：项目名 + group pill + 主数字 28px + 同比 + sparkline
 *
 * NOTE: 项目名仅在「总」列展示；线上/线下/其他列只展示 pill。
 */
function GroupCell({
  metric,
  project,
  group,
  cell,
  showProjectName,
  withDivider,
  onClick,
}: {
  metric: Section2Metric;
  project: ProjectKey;
  group: GroupKey;
  cell: GroupCellValue;
  showProjectName: boolean;
  withDivider: boolean;
  onClick: (c: BreakdownClick) => void;
}): React.JSX.Element {
  const notApplicable = cell.not_applicable === true;
  const { body, unit } = splitForMetric(metric, cell.value);
  const vs = formatVsPrevRatio(cell.vs_prev);
  const cellLabel = metricLabelForCell(metric, project);

  const pillClass =
    group === "all"
      ? "bg-[#f2f3f5] text-[#86909c]"
      : group === "online"
        ? "bg-[#e8f3ff] text-primary"
        : group === "offline"
          ? "bg-[#fff7e8] text-[#ff7d00]"
          : "bg-[#f2f3f5] text-[#86909c]";

  const pillLabel: Record<GroupKey, string> = {
    all: "总",
    online: "线上",
    offline: "线下",
    other: "其他",
  };

  return (
    <button
      type="button"
      onClick={() => onClick({ metric, project, group })}
      disabled={notApplicable}
      className={cn(
        "px-3 py-1 text-left transition-colors rounded-md",
        "hover:bg-[var(--hover-bg)] hover:ring-1 hover:ring-inset hover:ring-[var(--hover-ring)] hover:shadow-sm",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        withDivider && "border-l border-[#f2f3f5]",
        notApplicable && "opacity-60 cursor-not-allowed hover:bg-transparent hover:ring-0",
      )}
      aria-label={`${PROJECT_LABEL[project]} ${pillLabel[group]} ${cellLabel} 详情`}
    >
      <div className="flex items-center gap-1.5 mb-2 min-h-[20px]">
        {showProjectName ? (
          <span className="text-[12px] font-medium text-[#4e5969]">{PROJECT_LABEL[project]}</span>
        ) : null}
        <span className={cn("text-[11px] px-2 py-[2px] rounded font-normal", pillClass)}>
          {pillLabel[group]}
        </span>
        {metric === "install_or_activate" ? (
          <span className="text-[10px] text-[#86909c] ml-1">{cellLabel}</span>
        ) : null}
      </div>
      {notApplicable ? (
        <div className="leading-[1.15] tracking-[-0.01em] font-semibold tabular-nums text-[#c9cdd4]">
          <span className="text-[28px]">—</span>
        </div>
      ) : (
        <div className="leading-[1.15] tracking-[-0.01em] font-semibold tabular-nums text-[#1d2129]">
          <span className="text-[28px]">{body}</span>
          {unit ? (
            <span className="text-[14px] font-medium text-[#4e5969] ml-0.5">{unit}</span>
          ) : null}
        </div>
      )}
      <div className="text-[11px] text-[#86909c] mt-1.5 flex items-center gap-2">
        {notApplicable ? (
          <span className="text-[#c9cdd4]">不适用</span>
        ) : (
          <>
            <span>
              较前 7 日{" "}
              <span
                className={cn(
                  vs.kind === "up" && "text-change-up",
                  vs.kind === "down" && "text-change-down",
                  (vs.kind === "flat" || vs.kind === "none") && "text-[#86909c]",
                )}
              >
                {vs.text}
              </span>
            </span>
            <span className="ml-auto">
              <Sparkline data={cell.sparkline} width={64} height={20} />
            </span>
          </>
        )}
      </div>
    </button>
  );
}

/**
 * 占比 stacked bar（线上 / 线下 / 其他），段宽即占比；< 6% 段不显示百分比文字。
 */
function StackedBar({
  online,
  offline,
  other,
  metric,
  onClickSegment,
  project,
}: {
  online: GroupCellValue;
  offline: GroupCellValue;
  other: GroupCellValue;
  metric: Section2Metric;
  project: ProjectKey;
  onClickSegment: (c: BreakdownClick) => void;
}): React.JSX.Element {
  const sum = online.value + offline.value + other.value;
  // 全 0 时画一条灰色满条
  if (sum <= 0) {
    return (
      <div
        className="h-9 rounded-md bg-[#f2f3f5] flex items-center justify-center text-[11px] text-[#86909c]"
        role="img"
        aria-label="暂无数据"
      >
        暂无数据
      </div>
    );
  }
  const segs: {
    pct: number;
    value: number;
    anchorCount: number;
    bg: string;
    text: string;
    group: GroupKey;
  }[] = [
    {
      pct: (online.value / sum) * 100,
      value: online.value,
      anchorCount: online.anchor_count,
      bg: "bg-primary",
      text: "text-white",
      group: "online",
    },
    {
      pct: (offline.value / sum) * 100,
      value: offline.value,
      anchorCount: offline.anchor_count,
      bg: "bg-[#ff7d00]",
      text: "text-white",
      group: "offline",
    },
    {
      pct: (other.value / sum) * 100,
      value: other.value,
      anchorCount: other.anchor_count,
      bg: "bg-[#c9cdd4]",
      text: "text-[#4e5969]",
      group: "other",
    },
  ];

  return (
    <div className="h-9 rounded-md overflow-hidden flex bg-[#f2f3f5]" role="img">
      {segs.map((s) => (
        <button
          key={s.group}
          type="button"
          onClick={() => onClickSegment({ metric, project, group: s.group })}
          className={cn(
            "flex items-center justify-center text-[12px] font-semibold tracking-[-0.01em] transition-[filter] hover:brightness-105",
            s.bg,
            s.text,
          )}
          style={{ width: `${s.pct}%` }}
          title={`${s.pct.toFixed(1)}%`}
          aria-label={`${s.group} ${s.pct.toFixed(1)}%`}
        >
          {s.pct >= 6 ? `${s.pct.toFixed(1)}%` : ""}
        </button>
      ))}
    </div>
  );
}

/**
 * 单项目子区块：4 列 + stacked bar + 段下方人数/人均
 */
function ProjectBlock({
  metric,
  pb,
  withLeftBorder,
  onCellClick,
}: {
  metric: Section2Metric;
  pb: ProjectBreakdown;
  withLeftBorder: boolean;
  onCellClick: (c: BreakdownClick) => void;
}): React.JSX.Element {
  // 仅对「数值类」指标渲染占比条；「人数」类指标不需要 stacked bar（占比逻辑也成立但语义弱）
  // 与 variant-3 一致：保留 stacked bar，但当 metric 为 person 时把单位改成「人」
  const sumValue = pb.online.value + pb.offline.value + pb.other.value;
  const totalAnchor = pb.total.anchor_count;
  const projectNotApplicable = pb.total.not_applicable === true;

  // 段下小字：N 主播 · X/人 — 人均口径在 person metric 下不太合适，回退为「N 人」
  const subline = (cell: GroupCellValue): string => {
    if (isAnchorCountMetric(metric)) {
      return `${cell.anchor_count} 主播`;
    }
    if (cell.anchor_count <= 0) return "0 主播";
    const per = cell.value / cell.anchor_count;
    return `${cell.anchor_count} 主播 · ${formatChineseNumber(per)}/人`;
  };

  return (
    <div className={cn(withLeftBorder && "border-l border-[#f2f3f5] pl-8")}>
      <div className="grid grid-cols-4">
        <GroupCell
          metric={metric}
          project={pb.project}
          group="all"
          cell={pb.total}
          showProjectName
          withDivider={false}
          onClick={onCellClick}
        />
        <GroupCell
          metric={metric}
          project={pb.project}
          group="online"
          cell={pb.online}
          showProjectName={false}
          withDivider
          onClick={onCellClick}
        />
        <GroupCell
          metric={metric}
          project={pb.project}
          group="offline"
          cell={pb.offline}
          showProjectName={false}
          withDivider
          onClick={onCellClick}
        />
        <GroupCell
          metric={metric}
          project={pb.project}
          group="other"
          cell={pb.other}
          showProjectName={false}
          withDivider
          onClick={onCellClick}
        />
      </div>

      {projectNotApplicable ? (
        <div className="px-3 mt-5">
          <div
            className="h-9 rounded-md bg-[#f2f3f5] flex items-center justify-center text-[11px] text-[#86909c]"
            role="img"
            aria-label="不适用"
          >
            不适用 · {PROJECT_LABEL[pb.project]} 暂未启用「短视频流水」
          </div>
        </div>
      ) : (
        <div className="px-3 mt-5">
          <div className="flex items-center justify-between text-[11px] text-[#86909c] mb-1.5">
            <span>线上 / 线下 / 其他 占比</span>
            <span className="tabular-nums">{formatTotalLine(sumValue, totalAnchor)}</span>
          </div>
          <StackedBar
            online={pb.online}
            offline={pb.offline}
            other={pb.other}
            metric={metric}
            project={pb.project}
            onClickSegment={onCellClick}
          />
          <div className="flex justify-between text-[10px] text-[#86909c] mt-1 tabular-nums">
            <span>{subline(pb.online)}</span>
            <span>{subline(pb.offline)}</span>
            <span>{subline(pb.other)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function BreakdownSection({
  data,
  loading,
  metric,
  onMetricChange,
  onCellClick,
}: {
  data: DashboardOverviewResponse | null;
  loading: boolean;
  metric: Section2Metric;
  onMetricChange: (m: Section2Metric) => void;
  onCellClick: (c: BreakdownClick) => void;
}): React.JSX.Element {
  // 找当前 metric 对应的 breakdown item，找不到时降级到 0 占位
  const item: BreakdownItem | undefined = data?.breakdown.find((b) => b.metric === metric);

  const emptyCell: GroupCellValue = {
    project: "ddz",
    group: "all",
    value: 0,
    vs_prev: null,
    anchor_count: 0,
    sparkline: [],
  };
  const emptyPb = (project: ProjectKey): ProjectBreakdown => ({
    project,
    total: { ...emptyCell, project, group: "all" },
    online: { ...emptyCell, project, group: "online" },
    offline: { ...emptyCell, project, group: "offline" },
    other: { ...emptyCell, project, group: "other" },
  });

  const ddz = item?.ddz ?? emptyPb("ddz");
  const three = item?.three ?? emptyPb("three");

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-semibold tracking-tight">业务细分</h2>
        <div className="flex items-center gap-4 text-[12px] text-[#86909c]">
          <span className="flex items-center">
            <span className="w-2 h-2 rounded-sm inline-block mr-1 align-middle bg-primary" />
            线上
          </span>
          <span className="flex items-center">
            <span className="w-2 h-2 rounded-sm inline-block mr-1 align-middle bg-[#ff7d00]" />
            线下
          </span>
          <span className="flex items-center">
            <span className="w-2 h-2 rounded-sm inline-block mr-1 align-middle bg-[#c9cdd4]" />
            其他
          </span>
        </div>
      </div>

      <div className="rounded-xl bg-white px-6 pt-2 pb-5 shadow-[0_1px_0_0_rgba(0,0,0,0.02),0_4px_12px_-8px_rgba(0,0,0,0.04)]">
        <div
          className="flex items-center gap-6 text-[14px] border-b border-[#e5e6eb] overflow-x-auto"
          role="tablist"
          aria-label="指标"
        >
          {METRIC_TABS.map((t) => {
            const active = metric === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onMetricChange(t.id)}
                className={cn(
                  "py-3 px-1 transition-colors whitespace-nowrap rounded",
                  active
                    ? "text-primary font-semibold shadow-[inset_0_-2px_0_var(--primary)]"
                    : "text-[#1d2129] font-medium hover:text-primary",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-8 pt-6">
          <ProjectBlock metric={metric} pb={ddz} withLeftBorder={false} onCellClick={onCellClick} />
          <ProjectBlock metric={metric} pb={three} withLeftBorder onCellClick={onCellClick} />
        </div>
      </div>

      <p className="text-[12px] text-[#86909c] mt-3 px-1">
        ▸ 横向 stacked bar 展示项目内占比 · 段宽即占比 · 点击段可下钻到对应分组
        {loading ? " · 加载中…" : ""}
      </p>
    </section>
  );
}
