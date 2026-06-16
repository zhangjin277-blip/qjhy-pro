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
import { formatChineseNumber, formatVsPrevRatio, splitChineseNumber } from "./format";
import { Sparkline } from "./sparkline";

type BreakdownItem = DashboardOverviewResponse["breakdown"][number];

// 顺序即展示顺序：流水在最前（2026-06-12 应用户要求）
const METRIC_TABS: { id: Section2Metric; label: string }[] = [
  { id: "flow", label: "流水" },
  { id: "total_fan_ticket", label: "音浪" },
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
  three: "三国冰河时代",
};
const PROJECT_CAT: Record<ProjectKey, string> = {
  ddz: "棋牌系",
  three: "SLG",
};
/** 项目主题色（与 product_config accent 一致）：[深, 浅] 渐变端点 */
const PROJECT_GRADIENT: Record<ProjectKey, [string, string]> = {
  ddz: ["#b48a3c", "#d4a853"],
  three: ["#7e4bd0", "#a855f7"],
};
const PROJECT_DOT: Record<ProjectKey, string> = {
  ddz: "#d4a853",
  three: "#a855f7",
};

const GROUP_META: { key: Exclude<GroupKey, "all">; label: string; color: string; bar: string }[] = [
  { key: "online", label: "线上", color: "#1677ff", bar: "#1677ff" },
  { key: "offline", label: "线下", color: "#ff7d00", bar: "#ff7d00" },
  { key: "other", label: "其他", color: "#a9b0bc", bar: "#c9cdd4" },
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
function isLargePersonMetric(metric: Section2Metric): boolean {
  return metric === "install_or_activate" || metric === "show_uv" || metric === "watch_uv";
}

function splitForMetric(metric: Section2Metric, value: number): { body: string; unit: string } {
  if (isAnchorCountMetric(metric)) {
    return { body: value.toLocaleString("zh-CN"), unit: "人" };
  }
  if (isLargePersonMetric(metric)) {
    const split = splitChineseNumber(value);
    return { body: split.body, unit: split.unit ? `${split.unit} 人` : "人" };
  }
  return splitChineseNumber(value);
}

/** install_or_activate 在 ddz 显示「安装」、three 显示「激活」 */
function metricLabelFor(metric: Section2Metric, project: ProjectKey): string {
  if (metric === "install_or_activate") return project === "ddz" ? "安装" : "激活";
  return METRIC_TABS.find((t) => t.id === metric)?.label ?? metric;
}

function VsText({ vs }: { vs: { kind: string; text: string } }): React.JSX.Element {
  return (
    <span
      className={cn(
        vs.kind === "up" && "text-change-up",
        vs.kind === "down" && "text-change-down",
        (vs.kind === "flat" || vs.kind === "none") && "text-[#86909c]",
      )}
    >
      {vs.text}
    </span>
  );
}

/** 项目色大总卡：大数字 + 环比 + 主播数 + 底部走势水波 */
function HeroCard({
  metric,
  pb,
  onClick,
}: {
  metric: Section2Metric;
  pb: ProjectBreakdown;
  onClick: (c: BreakdownClick) => void;
}): React.JSX.Element {
  const cell = pb.total;
  const notApplicable = cell.not_applicable === true;
  const [from, to] = PROJECT_GRADIENT[pb.project];
  const { body, unit } = splitForMetric(metric, cell.value);
  const vs = formatVsPrevRatio(cell.vs_prev);

  return (
    <button
      type="button"
      disabled={notApplicable}
      onClick={() => onClick({ metric, project: pb.project, group: "all" })}
      className={cn(
        "relative flex items-center gap-2 overflow-hidden rounded-xl px-4 py-3 text-left text-white transition-transform",
        "hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        notApplicable && "cursor-not-allowed opacity-60",
      )}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
      aria-label={`${PROJECT_LABEL[pb.project]} 总 ${metricLabelFor(metric, pb.project)} 详情`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[12px] opacity-85">总{metricLabelFor(metric, pb.project)}</div>
        {notApplicable ? (
          <div className="mt-0.5 text-[30px] font-bold leading-[1.1]">—</div>
        ) : (
          <div className="mt-0.5 font-bold leading-[1.1] tracking-[-0.02em] tabular-nums">
            <span className="text-[30px]">{body}</span>
            {unit ? (
              <span className="ml-0.5 text-[15px] font-medium opacity-90">{unit}</span>
            ) : null}
          </div>
        )}
        <div className="mt-1 text-[11.5px] opacity-90">
          {notApplicable ? (
            "不适用"
          ) : (
            <>
              较前 7 日 {vs.text} · {cell.anchor_count} 名主播
            </>
          )}
        </div>
      </div>
      {/* 右侧走势水波（真实 sparkline，白色半透明面积，贴底） */}
      {!notApplicable && cell.sparkline.length >= 2 && (
        <div className="pointer-events-none w-[42%] shrink-0 self-end opacity-55">
          <Sparkline
            data={cell.sparkline}
            width={240}
            height={50}
            stroke="rgba(255,255,255,0.9)"
            fillColor="rgba(255,255,255,0.3)"
            strokeWidth={1.5}
            className="block w-full"
          />
        </div>
      )}
    </button>
  );
}

/** 线上/线下/其他 卫星小卡：数值 + 环比 + 占比条 */
function SatCard({
  metric,
  pb,
  group,
  onClick,
}: {
  metric: Section2Metric;
  pb: ProjectBreakdown;
  group: Exclude<GroupKey, "all">;
  onClick: (c: BreakdownClick) => void;
}): React.JSX.Element {
  const meta = GROUP_META.find((g) => g.key === group);
  const cell: GroupCellValue = pb[group];
  const notApplicable = cell.not_applicable === true || pb.total.not_applicable === true;
  const sum = pb.online.value + pb.offline.value + pb.other.value;
  const pct = sum > 0 ? (cell.value / sum) * 100 : 0;
  const { body, unit } = splitForMetric(metric, cell.value);
  const vs = formatVsPrevRatio(cell.vs_prev);

  return (
    <button
      type="button"
      disabled={notApplicable}
      onClick={() => onClick({ metric, project: pb.project, group })}
      className={cn(
        "rounded-xl border border-[#eef1f7] bg-gradient-to-b from-[#fbfcfe] to-[#f8fafd] p-3 text-left",
        "transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-12px_rgba(22,119,255,0.3)]",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        notApplicable && "cursor-not-allowed opacity-50 hover:translate-y-0 hover:shadow-none",
      )}
      aria-label={`${PROJECT_LABEL[pb.project]} ${meta?.label} ${metricLabelFor(metric, pb.project)} 详情`}
    >
      <div className="flex items-center gap-1.5 text-[12px] text-[#86909c]">
        <span
          className="inline-block h-[7px] w-[7px] rounded-full"
          style={{ background: meta?.color }}
        />
        {meta?.label}
      </div>
      {notApplicable ? (
        <div className="mt-1 text-[22px] font-bold text-[#c9cdd4]">—</div>
      ) : (
        <div className="mt-1 font-bold leading-[1.15] tabular-nums text-[#1d2129]">
          <span className="text-[22px]">{body}</span>
          {unit ? (
            <span className="ml-0.5 text-[12px] font-medium text-[#4e5969]">{unit}</span>
          ) : null}
        </div>
      )}
      <div className="mt-1 text-[11px] text-[#86909c]">
        {notApplicable ? (
          "不适用"
        ) : (
          <>
            <VsText vs={vs} /> · 占 {pct.toFixed(0)}% · {cell.anchor_count} 主播
          </>
        )}
      </div>
      <div className="mt-2 h-[4px] overflow-hidden rounded-full bg-[#f0f2f7]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: meta?.bar }} />
      </div>
    </button>
  );
}

/** 单项目区块：项目头 + (大总卡 | 线上 | 线下 | 其他) */
function ProjectRow({
  metric,
  pb,
  onCellClick,
}: {
  metric: Section2Metric;
  pb: ProjectBreakdown;
  onCellClick: (c: BreakdownClick) => void;
}): React.JSX.Element {
  const sum = pb.online.value + pb.offline.value + pb.other.value;
  return (
    <div className="rounded-xl border border-[#f0f2f7] p-3.5">
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className="h-[9px] w-[9px] rounded-[3px]"
          style={{ background: PROJECT_DOT[pb.project] }}
        />
        <span className="text-[14px] font-bold">{PROJECT_LABEL[pb.project]}</span>
        <span className="rounded-[5px] bg-[#f3f5fb] px-2 py-0.5 text-[11px] text-[#86909c]">
          {PROJECT_CAT[pb.project]}
        </span>
        <span className="ml-auto text-[11.5px] tabular-nums text-[#86909c]">
          {pb.total.not_applicable
            ? ""
            : `合计 ${formatChineseNumber(sum)} · ${pb.total.anchor_count} 主播`}
        </span>
      </div>
      <div className="space-y-2.5">
        <HeroCard metric={metric} pb={pb} onClick={onCellClick} />
        <div className="grid grid-cols-3 gap-2.5">
          <SatCard metric={metric} pb={pb} group="online" onClick={onCellClick} />
          <SatCard metric={metric} pb={pb} group="offline" onClick={onCellClick} />
          <SatCard metric={metric} pb={pb} group="other" onClick={onCellClick} />
        </div>
      </div>
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
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold tracking-tight">业务细分</h2>
        <div className="flex items-center gap-4 text-[12px] text-[#86909c]">
          {GROUP_META.map((g) => (
            <span key={g.key} className="flex items-center">
              <span
                className="mr-1 inline-block h-2 w-2 rounded-sm align-middle"
                style={{ background: g.color }}
              />
              {g.label}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-white px-4 pb-4 pt-4 shadow-[0_1px_0_0_rgba(0,0,0,0.02),0_4px_12px_-8px_rgba(0,0,0,0.04)]">
        <div className="mb-4 flex flex-wrap items-center gap-1.5" role="tablist" aria-label="指标">
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
                  "whitespace-nowrap rounded-full px-3.5 py-1 text-[12.5px] transition-colors",
                  active
                    ? "bg-primary font-semibold text-white"
                    : "bg-[#f3f5fb] text-[#4e5969] hover:bg-[#e8f3ff] hover:text-primary",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <ProjectRow metric={metric} pb={ddz} onCellClick={onCellClick} />
          <ProjectRow metric={metric} pb={three} onCellClick={onCellClick} />
        </div>
      </div>

      <p className="mt-3 px-1 text-[12px] text-[#86909c]">
        ▸ 点击任意卡片下钻该分组的主播明细{loading ? " · 加载中…" : ""}
      </p>
    </section>
  );
}
