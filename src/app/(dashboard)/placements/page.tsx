import { Suspense } from "react";
import {
  queryDatasetCounts,
  queryDetail,
  querySummary,
  querySchedule,
  queryTrend,
  queryAnchorLabels,
} from "@/modules/placement/server";
import { resolveFilter } from "@/modules/placement";
import { DatasetTabs } from "./_components/dataset-tabs";
import { ViewModeToggle } from "./_components/view-mode-toggle";
import { DetailTable } from "./_components/detail-table";
import { SummaryTable } from "./_components/summary-table";
import { ScheduleTable } from "./_components/schedule-table";
import { TrendChartWrapper } from "./_components/trend-chart-wrapper";
import { FilterBar } from "./_components/filter-bar";
import { CsvExportButton } from "./_components/csv-export-button";

export default async function PlacementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filter = resolveFilter(sp);
  const view = filter.view ?? "detail";

  const [counts, anchorLabels] = await Promise.all([
    queryDatasetCounts(filter),
    queryAnchorLabels(filter),
  ]);

  const showChart = sp.chart === "1";

  interface CsvCol {
    key: string;
    label: string;
  }

  async function buildViewData() {
    if (view === "summary") {
      const rows = await querySummary(filter);
      const csvRows = rows as unknown as Record<string, unknown>[];
      const csvColumns: CsvCol[] = [
        { key: "anchor_label", label: "投放标签" },
        { key: "row_count", label: "行数" },
        { key: "cost", label: "消耗" },
        { key: "activations", label: "激活" },
        { key: "payment", label: "付费" },
      ];
      const csvFilename = `投放-汇总-${filter.date_from}_${filter.date_to}.csv`;
      const tableContent = <SummaryTable rows={rows} />;
      return { tableContent, csvRows, csvColumns, csvFilename };
    }
    if (view === "schedule") {
      const rows = await querySchedule(filter);
      const csvRows = rows as unknown as Record<string, unknown>[];
      const csvColumns: CsvCol[] = [
        { key: "date", label: "日期" },
        { key: "account_name", label: "账号" },
        { key: "anchor_name", label: "主播" },
        { key: "total_cost", label: "总消耗" },
        { key: "personal_cost", label: "个人消耗" },
        { key: "total_acts", label: "总激活" },
        { key: "personal_acts", label: "个人激活" },
      ];
      const csvFilename = `投放-主播排班-${filter.date_from}_${filter.date_to}.csv`;
      const tableContent = <ScheduleTable rows={rows} />;
      return { tableContent, csvRows, csvColumns, csvFilename };
    }
    // detail (default)
    const rows = await queryDetail(filter);
    const csvRows = rows as unknown as Record<string, unknown>[];
    const csvColumns: CsvCol[] = [
      { key: "date", label: "日期" },
      { key: "hour", label: "时段" },
      { key: "dataset_id", label: "产品" },
      { key: "account_name", label: "账号" },
      { key: "anchor_label", label: "投放标签" },
      { key: "cost", label: "消耗" },
      { key: "activations", label: "激活" },
      { key: "payment", label: "付费" },
    ];
    const csvFilename = `投放-单包-${filter.date_from}_${filter.date_to}.csv`;
    const tableContent = <DetailTable rows={rows} />;
    return { tableContent, csvRows, csvColumns, csvFilename };
  }

  const { tableContent, csvRows, csvColumns, csvFilename } = await buildViewData();

  // Trend data (always fetched when chart is shown or for preload)
  const trendData = showChart ? await queryTrend(filter) : [];

  return (
    <div className="space-y-4">
      {/* Top bar: dataset tabs + view mode + controls */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <Suspense fallback={null}>
          <DatasetTabs counts={counts} />
        </Suspense>

        <div className="h-5 w-px bg-slate-200" />

        <Suspense fallback={null}>
          <ViewModeToggle current={view as "detail" | "summary" | "schedule"} />
        </Suspense>

        <div className="h-5 w-px bg-slate-200" />

        {/* 增量/累计 chip (cumulative TODO) */}
        <div className="flex gap-0 rounded-md border border-slate-200 p-0.5 bg-slate-50">
          <button className="rounded bg-white px-3 py-1 text-xs font-medium text-slate-900 shadow-sm">
            增量
          </button>
          <button
            className="rounded px-3 py-1 text-xs text-slate-400 cursor-not-allowed"
            title="累计模式待开发"
            disabled
          >
            累计
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ChartToggleLink showChart={showChart} sp={sp as Record<string, string>} />
          <CsvExportButton rows={csvRows} filename={csvFilename} columns={csvColumns} />
        </div>
      </div>

      {/* Anchor label filter (client) */}
      <Suspense fallback={null}>
        <FilterBar anchorLabels={anchorLabels} />
      </Suspense>

      {/* Trend chart */}
      {showChart && (
        <Suspense fallback={<div className="h-80 animate-pulse rounded-lg bg-slate-100" />}>
          <TrendChartWrapper data={trendData} />
        </Suspense>
      )}

      {/* Main table */}
      {tableContent}
    </div>
  );
}

function ChartToggleLink({ showChart, sp }: { showChart: boolean; sp: Record<string, string> }) {
  const usp = new URLSearchParams(sp);
  if (showChart) {
    usp.delete("chart");
  } else {
    usp.set("chart", "1");
  }
  return (
    <a
      href={`/placements?${usp.toString()}`}
      className={`rounded border px-3 py-1 text-xs font-medium transition-colors ${
        showChart
          ? "border-blue-300 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {showChart ? "收起图表" : "趋势图表"}
    </a>
  );
}
