"use client";

import { cn } from "@/lib/utils/cn";
import type { CoreKpiResponse, CoreKpiValue } from "@/modules/dashboard";
import { formatChineseNumber, formatVsPrevShort, splitChineseNumber } from "./format";
import { Sparkline } from "./sparkline";

export type TimePreset = "yesterday" | "last7" | "last30" | "this_month" | "last_month" | "custom";

const TIME_PRESETS: { id: TimePreset; label: string }[] = [
  { id: "yesterday", label: "昨天" },
  { id: "last7", label: "近 7 日" },
  { id: "last30", label: "近 30 日" },
  { id: "this_month", label: "本月" },
  { id: "last_month", label: "上月" },
  { id: "custom", label: "自定义" },
];

const KPI_DEFS: {
  key: keyof CoreKpiResponse;
  label: string;
  unitFor: (value: number) => string;
}[] = [
  { key: "total_fan_ticket", label: "音浪", unitFor: () => "" },
  { key: "flow", label: "流水", unitFor: () => "" },
  { key: "active_anchor_count", label: "开播主播数", unitFor: () => "人" },
  { key: "new_anchor_count", label: "新入驻主播数", unitFor: () => "人" },
  { key: "first_live_anchor_count", label: "首次开播主播数", unitFor: () => "人" },
];

/** 「人」类指标：直接显示整数 + 「人」单位 */
function isPersonMetric(key: keyof CoreKpiResponse): boolean {
  return (
    key === "active_anchor_count" || key === "new_anchor_count" || key === "first_live_anchor_count"
  );
}

function formatPersonOrChinese(
  key: keyof CoreKpiResponse,
  value: number,
): { body: string; unit: string } {
  if (isPersonMetric(key)) {
    return { body: value.toLocaleString("zh-CN"), unit: "人" };
  }
  // 音浪 / 流水：用中文缩写，主体 + 单位（万 / 亿）
  return splitChineseNumber(value);
}

/** 子行（昨日同期 / 上周同期）— 含值 + 同比箭头 */
function CompareRow({
  label,
  cur,
  prev,
  metricKey,
}: {
  label: string;
  cur: number;
  prev: number | null;
  metricKey: keyof CoreKpiResponse;
}): React.JSX.Element {
  const prevDisplay =
    prev === null
      ? "—"
      : isPersonMetric(metricKey)
        ? `${prev.toLocaleString("zh-CN")} 人`
        : formatChineseNumber(prev);
  const vs = formatVsPrevShort(cur, prev);
  return (
    <div className="flex min-w-0 items-center justify-between gap-1 text-[11px] sm:text-[12px]">
      <span className="text-[#667085]">{label}</span>
      <span>
        <span className="text-[#4e5969]">{prevDisplay}</span>{" "}
        <span
          className={cn(
            vs.kind === "up" && "text-change-up",
            vs.kind === "down" && "text-change-down",
            (vs.kind === "flat" || vs.kind === "none") && "text-[#667085]",
          )}
        >
          {vs.text}
        </span>
      </span>
    </div>
  );
}

function KpiCard({
  label,
  metricKey,
  value,
  singleDay,
  onClick,
}: {
  label: string;
  metricKey: keyof CoreKpiResponse;
  value: CoreKpiValue;
  singleDay: boolean;
  onClick: () => void;
}): React.JSX.Element {
  const { body, unit } = formatPersonOrChinese(metricKey, value.current);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "card-surface group block min-h-[164px] min-w-0 w-full rounded-lg bg-[var(--bg-kpi-card)] p-3 text-left sm:p-4",
        "shadow-[inset_0_0_0_1px_rgba(226,232,240,0.34),0_4px_12px_-10px_rgba(40,55,120,0.16)]",
        "transition-colors hover:bg-[var(--hover-bg)] hover:ring-1 hover:ring-inset hover:ring-[var(--hover-ring)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
      )}
      aria-label={`${label} 详情`}
    >
      <div className="text-[13px] font-medium text-[#667085]">{label}</div>
      <div className="mt-2 font-bold leading-[1.1] text-[#1d2129] tabular-nums">
        <span className="text-[32px]">{body}</span>
        {unit ? <span className="ml-1 text-[15px] font-medium text-[#4e5969]">{unit}</span> : null}
      </div>
      <div className="mt-3 space-y-1">
        {/* 后端 prev_day = 往前推一个等长周期：单日时即前一日；多天时即上一周期。
            多天区间不展示 prev_week（固定推 7 天）：近 7 日时与上一周期重合、
            近 30 日/本月时与当前窗口重叠，对比无意义 */}
        <CompareRow
          label={singleDay ? "前一日" : "上一周期"}
          cur={value.current}
          prev={value.prev_day}
          metricKey={metricKey}
        />
        {singleDay && (
          <CompareRow
            label="上周同期"
            cur={value.current}
            prev={value.prev_week}
            metricKey={metricKey}
          />
        )}
      </div>
      {value.trend && value.trend.length >= 2 && (
        <div className="mt-2 border-t border-[#e5e9f2] pt-2">
          <div className="mb-1 text-[10.5px] font-medium text-[#667085]">近 14 天趋势</div>
          <Sparkline
            data={value.trend}
            width={220}
            height={36}
            stroke="#2563eb"
            fill
            fillOpacity={0.3}
            strokeWidth={2.4}
            className="w-full"
          />
        </div>
      )}
    </button>
  );
}

export function CoreKpiSection({
  core,
  loading,
  preset,
  onPresetChange,
  customFrom,
  customTo,
  onCustomChange,
  onCardClick,
  rangeFrom,
  rangeTo,
}: {
  core: CoreKpiResponse | null;
  loading: boolean;
  preset: TimePreset;
  onPresetChange: (p: TimePreset) => void;
  customFrom: string;
  customTo: string;
  onCustomChange: (range: { from: string; to: string }) => void;
  onCardClick: (metricKey: keyof CoreKpiResponse) => void;
  rangeFrom: string;
  rangeTo: string;
}): React.JSX.Element {
  const singleDay = rangeFrom === rangeTo;
  return (
    <section className="glass-panel rounded-xl px-4 py-4">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="text-[15px] font-semibold tracking-tight">核心数据</h2>
        <div className="flex min-w-0 items-center gap-2">
          {preset === "custom" ? (
            <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => onCustomChange({ from: e.target.value, to: customTo })}
                className="h-7 rounded-md border border-input px-2 text-[13px] bg-white"
              />
              <span className="text-[#667085]">~</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => onCustomChange({ from: customFrom, to: e.target.value })}
                className="h-7 rounded-md border border-input px-2 text-[13px] bg-white"
              />
            </div>
          ) : null}
          <div
            className="flex max-w-full flex-wrap gap-1 rounded-lg bg-[#f3f5fb] p-1 text-[13px] sm:flex-nowrap sm:overflow-x-auto"
            role="tablist"
            aria-label="时间范围"
          >
            {TIME_PRESETS.map((p) => {
              const active = preset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onPresetChange(p.id)}
                  className={cn(
                    "shrink-0 rounded-md px-2.5 py-1 transition-colors sm:px-3",
                    active
                      ? "bg-white shadow-sm text-[#1d2129] font-medium"
                      : "text-[#667085] hover:text-[#344054]",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {KPI_DEFS.map((def) => {
          const v: CoreKpiValue = core?.[def.key] ?? {
            current: 0,
            prev_day: null,
            prev_week: null,
          };
          return (
            <KpiCard
              key={def.key}
              label={def.label}
              metricKey={def.key}
              value={v}
              singleDay={singleDay}
              onClick={() => onCardClick(def.key)}
            />
          );
        })}
      </div>

      {loading ? <p className="mt-3 px-1 text-[12px] text-[#667085]">加载中…</p> : null}
    </section>
  );
}
