"use client";

import { cn } from "@/lib/utils/cn";
import { DateRangePicker } from "@/components/patterns/date-range-picker";
import type { CoreKpiResponse } from "@/modules/dashboard";
import { formatChineseNumber, formatVsPrevShort, splitChineseNumber } from "./format";
import { KpiGrid } from "@/components/patterns/kpi-grid";
import { DataToolbar } from "@/components/patterns/data-toolbar";
import { PresetChip, PresetToolbar } from "@/components/patterns/preset-toolbar";
import { ChevronRight } from "lucide-react";
import styles from "./business-board.module.css";

export type TimePreset = "yesterday" | "last7" | "last30" | "this_month" | "last_month" | "custom";

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

export function CoreKpiSection({
  core,
  loading,
  datePresets,
  onCustomChange,
  onCardClick,
  rangeFrom,
  rangeTo,
}: {
  core: CoreKpiResponse | null;
  loading: boolean;
  datePresets: { label: string; value: { from: string; to: string } }[];
  onCustomChange: (range: { from: string; to: string }) => void;
  onCardClick: (metricKey: keyof CoreKpiResponse) => void;
  rangeFrom: string;
  rangeTo: string;
}): React.JSX.Element {
  const singleDay = rangeFrom === rangeTo;
  return (
    <section aria-label="核心经营指标" className={styles.core}>
      <DataToolbar
        className={styles.dateBar}
        filters={
          <>
            <DateRangePicker
              label="统计日期"
              value={{ from: rangeFrom, to: rangeTo }}
              onChange={onCustomChange}
              presets={datePresets}
            />
            <PresetToolbar label={null}>
              {datePresets.map((item) => (
                <PresetChip
                  key={item.label}
                  active={item.value.from === rangeFrom && item.value.to === rangeTo}
                  onClick={() => onCustomChange(item.value)}
                >
                  {item.label}
                </PresetChip>
              ))}
            </PresetToolbar>
          </>
        }
        actions={
          <span className={styles.dateNote}>
            统计截至 {rangeTo} · 日结数据 T+1{loading && " · 更新中"}
          </span>
        }
      />
      <div className={styles.kpis} aria-busy={loading}>
        <KpiGrid
          items={KPI_DEFS.map((def) => {
            const value = core?.[def.key];
            const formatted = value ? formatPersonOrChinese(def.key, value.current) : null;
            return {
              key: def.key,
              label: (
                <button
                  type="button"
                  className={styles.kpiHit}
                  aria-label={`${def.label} 详情`}
                  disabled={!value || loading}
                  onClick={() => onCardClick(def.key)}
                >
                  <span>{def.label}</span>
                  <ChevronRight size={14} />
                </button>
              ),
              value: formatted ? (
                <>
                  {formatted.body}
                  <small>{formatted.unit}</small>
                </>
              ) : (
                "—"
              ),
              footer: value ? (
                <div className={styles.compares}>
                  <CompareRow
                    label={singleDay ? "前一日" : "上一周期"}
                    cur={value.current}
                    prev={value.prev_day}
                    metricKey={def.key}
                  />
                  {singleDay && (
                    <CompareRow
                      label="上周同期"
                      cur={value.current}
                      prev={value.prev_week}
                      metricKey={def.key}
                    />
                  )}
                </div>
              ) : (
                <span>{loading ? "加载中…" : "暂无数据"}</span>
              ),
            };
          })}
        />
      </div>
    </section>
  );
}
