import { Suspense } from "react";
import {
  queryDatasetCounts,
  querySummaryExt,
  querySchedule,
  queryScheduleYesterdayHourly,
  queryTrend,
  queryAnchorLabels,
  queryKpiSummary,
  querySubAccountsAll,
} from "@/modules/placement/server";
import { resolveFilter } from "@/modules/placement";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { DatasetTabs } from "./_components/dataset-tabs";
import { ViewModeToggle } from "./_components/view-mode-toggle";
import { SummaryTable } from "./_components/summary-table";
import { ScheduleTable } from "./_components/schedule-table";
import { TrendChartWrapper } from "./_components/trend-chart-wrapper";
import { FilterBar } from "./_components/filter-bar";
import { CsvExportButton } from "./_components/csv-export-button";
import { KpiBar } from "./_components/kpi-bar";
import { PresetToolbar } from "@/components/patterns/preset-toolbar";
import { DataToolbar } from "@/components/patterns/data-toolbar";

export default async function PlacementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filter = resolveFilter(sp);
  const view = filter.view === "schedule" ? "schedule" : "summary";

  const [counts, anchorLabels, kpi] = await Promise.all([
    queryDatasetCounts(filter),
    queryAnchorLabels(filter),
    queryKpiSummary(filter),
  ]);

  const showChart = sp.chart === "1";

  interface CsvCol {
    key: string;
    label: string;
  }

  async function buildViewData() {
    if (view === "schedule") {
      const [rows, yesterdayHourly] = await Promise.all([
        querySchedule(filter),
        queryScheduleYesterdayHourly(filter),
      ]);
      const csvRows = rows as unknown as Record<string, unknown>[];
      const csvColumns: CsvCol[] = [
        { key: "date", label: "日期" },
        { key: "account_name", label: "账号" },
        { key: "anchor_name", label: "主播" },
        { key: "total_cost", label: "累计消耗" },
        { key: "personal_cost", label: "个人消耗" },
        { key: "total_acts", label: "累计激活" },
        { key: "personal_acts", label: "个人激活" },
      ];
      const csvFilename = `投放-主播投放-${filter.date_from}_${filter.date_to}.csv`;
      const tableContent = (
        <ScheduleTable
          rows={rows}
          yesterdayHourly={yesterdayHourly.byAccount}
          yesterdayCutoffHour={yesterdayHourly.cutoffHour}
        />
      );
      return { tableContent, csvRows, csvColumns, csvFilename };
    }
    // summary (default)
    const [rows, subAccounts] = await Promise.all([
      querySummaryExt(filter),
      querySubAccountsAll(filter),
    ]);
    const csvRows = rows as unknown as Record<string, unknown>[];
    const csvColumns: CsvCol[] = [
      { key: "anchor_label", label: "主播" },
      { key: "account_count", label: "投放包数" },
      { key: "cost", label: "消耗" },
      { key: "activations", label: "激活" },
      { key: "payment", label: "付费" },
    ];
    const csvFilename = `投放-主播汇总-${filter.date_from}_${filter.date_to}.csv`;
    // filter 变化时整组件 remount（清空 expanded / hourlyMap 客户端缓存）
    const filterKey = `${filter.date_from}|${filter.date_to}|${(filter.dataset_ids ?? []).join(",")}|${filter.search ?? ""}|${filter.anchor_label ?? ""}`;
    const tableContent = (
      <SummaryTable key={filterKey} rows={rows} subAccounts={subAccounts} filter={filter} />
    );
    return { tableContent, csvRows, csvColumns, csvFilename };
  }

  const { tableContent, csvRows, csvColumns, csvFilename } = await buildViewData();

  const trendData = showChart ? await queryTrend(filter) : [];

  return (
    <div className="space-y-3">
      {/* 全局筛选：日期 + 搜索 + 操作（最上面） */}
      <DataToolbar
        filters={
          <Suspense fallback={null}>
            <FilterBar anchorLabels={anchorLabels} />
          </Suspense>
        }
        actions={
          <>
            <ChartToggleLink showChart={showChart} sp={sp as Record<string, string>} />
            <CsvExportButton rows={csvRows} filename={csvFilename} columns={csvColumns} />
          </>
        }
      />

      {/* dataset tabs + view mode（在 KPI 之前，跟主播明细的预设标签同位置） */}
      <PresetToolbar label="预设:">
        <Suspense fallback={null}>
          <DatasetTabs counts={counts} />
        </Suspense>
        <PresetToolbar.Divider />
        <Suspense fallback={null}>
          <ViewModeToggle current={view} />
        </Suspense>
      </PresetToolbar>

      {/* KPI bar */}
      <KpiBar data={kpi} />

      {/* Trend chart */}
      {showChart && (
        <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-slate-100" />}>
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
      className={cn(buttonVariants({ size: "sm", variant: showChart ? "secondary" : "outline" }))}
    >
      {showChart ? "收起图表" : "趋势图表"}
    </a>
  );
}
