"use client";

import { cn } from "@/lib/utils/cn";
import type { CoreKpiResponse, CoreKpiValue } from "@/modules/dashboard";
import { formatChineseNumber, formatVsPrevShort, splitChineseNumber } from "./format";

export type TimePreset = "yesterday" | "last7" | "last30";

const TIME_PRESETS: { id: TimePreset; label: string }[] = [
  { id: "yesterday", label: "昨天" },
  { id: "last7", label: "近 7 日" },
  { id: "last30", label: "近 30 日" },
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
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-[#86909c]">{label}</span>
      <span>
        <span className="text-[#4e5969]">{prevDisplay}</span>{" "}
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
    </div>
  );
}

function KpiCard({
  label,
  metricKey,
  value,
  onClick,
}: {
  label: string;
  metricKey: keyof CoreKpiResponse;
  value: CoreKpiValue;
  onClick: () => void;
}): React.JSX.Element {
  const { body, unit } = formatPersonOrChinese(metricKey, value.current);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "card-surface block w-full text-left p-5 rounded-xl bg-white",
        "shadow-[0_1px_0_0_rgba(0,0,0,0.02),0_4px_12px_-8px_rgba(0,0,0,0.04)]",
        "transition-colors hover:bg-[var(--hover-bg)] hover:ring-1 hover:ring-inset hover:ring-[var(--hover-ring)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
      )}
      aria-label={`${label} 详情`}
    >
      <div className="text-[13px] text-[#86909c]">{label}</div>
      <div className="mt-3 leading-[1.1] tracking-[-0.02em] text-[#1d2129] font-bold tabular-nums">
        <span className="text-[40px]">{body}</span>
        {unit ? <span className="text-[20px] font-medium ml-1 text-[#4e5969]">{unit}</span> : null}
      </div>
      <div className="mt-3 space-y-1">
        <CompareRow
          label="昨日同期"
          cur={value.current}
          prev={value.prev_day}
          metricKey={metricKey}
        />
        <CompareRow
          label="上周同期"
          cur={value.current}
          prev={value.prev_week}
          metricKey={metricKey}
        />
      </div>
    </button>
  );
}

export function CoreKpiSection({
  core,
  loading,
  preset,
  onPresetChange,
  onCardClick,
}: {
  core: CoreKpiResponse | null;
  loading: boolean;
  preset: TimePreset;
  onPresetChange: (p: TimePreset) => void;
  onCardClick: (metricKey: keyof CoreKpiResponse) => void;
}): React.JSX.Element {
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-semibold tracking-tight">核心数据</h2>
        <div
          className="flex gap-1 text-[13px] bg-[#f2f3f5] rounded-lg p-1"
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
                  "px-3 py-1 rounded-md transition-colors",
                  active
                    ? "bg-white shadow-sm text-[#1d2129] font-medium"
                    : "text-[#86909c] hover:text-[#4e5969]",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-4">
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
              onClick={() => onCardClick(def.key)}
            />
          );
        })}
      </div>

      {loading ? <p className="text-[12px] text-[#86909c] mt-3 px-1">加载中…</p> : null}
    </section>
  );
}
