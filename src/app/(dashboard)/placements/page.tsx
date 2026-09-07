import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  queryDatasetCounts,
  querySummaryExt,
  queryTrend,
  queryAnchorLabels,
  queryKpiSummary,
  querySubAccountsAll,
  queryCheckinByAccount,
  queryPlacementAccounts,
  queryPlacementTimeRange,
  resolvePlacementScope,
  type CheckinSlot,
} from "@/modules/placement/server";
import { resolveFilter, resolveTimeRangeSelection } from "@/modules/placement";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { DatasetTabs } from "./_components/dataset-tabs";
import { SummaryTable } from "./_components/summary-table";
import { SummaryCards } from "./_components/summary-cards";
import { TrendChartWrapper } from "./_components/trend-chart-wrapper";
import { FilterBar } from "./_components/filter-bar";
import { CsvExportButton } from "./_components/csv-export-button";
import { KpiBar } from "./_components/kpi-bar";
import { PresetToolbar } from "@/components/patterns/preset-toolbar";
import { DataToolbar } from "@/components/patterns/data-toolbar";
import { PlacementTabs } from "./_components/placement-tabs";
import { TimeRangeFilterBar } from "./_components/time-range-filter-bar";
import { TimeRangeResults } from "./_components/time-range-results";
import { TimeRangeExportButton } from "./_components/time-range-export-button";

export default async function PlacementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // 解析当前用户的 placement scope（none → 拒绝；team/self → 限定 user_ids；all → 不过滤）
  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind === "unauth") redirect("/login");
  if (ctx.kind === "user_not_synced") {
    return (
      <div className="p-6 text-sm text-red-600">
        当前账号尚未同步到钉钉用户表，无法计算权限。请联系管理员。
      </div>
    );
  }
  const scope = await resolvePlacementScope(ctx.dingtalkUserId, ctx.isEmergency);
  if (scope.kind === "reject") {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        无投放数据查看权限。请联系管理员开通 placement 板块权限。
      </div>
    );
  }

  const sp = await searchParams;
  const baseFilter = { ...resolveFilter(sp), scope };
  const activeTab = sp.tab === "time-range" ? "time-range" : "summary";

  if (activeTab === "time-range") {
    const timeSelection = resolveTimeRangeSelection(sp);
    const filter = { ...baseFilter, ...timeSelection };
    const [counts, accounts, result] = await Promise.all([
      queryDatasetCounts(baseFilter),
      queryPlacementAccounts(baseFilter),
      queryPlacementTimeRange(filter),
    ]);
    const accountName =
      accounts.find((account) => account.account_id === timeSelection.account_id)?.account_name ??
      "全部账号";
    const csvColumns = [
      { key: "window_date", label: "归属日期" },
      { key: "date", label: "实际日期" },
      { key: "time_range", label: "时段" },
      { key: "anchor_name", label: "主播" },
      { key: "account_name", label: "直播账号" },
      { key: "placement_label", label: "投放标签" },
      { key: "cost", label: "消耗" },
      { key: "activations", label: "激活" },
      { key: "payment", label: "付费" },
    ];
    const filename = `投放-时段查询-${accountName}-${baseFilter.date_from}_${baseFilter.date_to}-第${result.page}页.csv`;
    const previousHref = result.page > 1 ? buildTimeRangePageHref(sp, result.page - 1) : undefined;
    const nextHref =
      result.page * result.page_size < result.total
        ? buildTimeRangePageHref(sp, result.page + 1)
        : undefined;

    return (
      <div className="space-y-3">
        <PresetToolbar label="视图:">
          <Suspense fallback={null}>
            <PlacementTabs current="time-range" />
          </Suspense>
        </PresetToolbar>

        <DataToolbar
          filters={
            <Suspense fallback={null}>
              <TimeRangeFilterBar
                dateFrom={baseFilter.date_from}
                dateTo={baseFilter.date_to}
                startHour={timeSelection.start_hour}
                endHour={timeSelection.end_hour}
                accountId={timeSelection.account_id}
                accounts={accounts}
              />
            </Suspense>
          }
          actions={
            <TimeRangeExportButton
              request={{
                date_from: baseFilter.date_from,
                date_to: baseFilter.date_to,
                dataset_ids: baseFilter.dataset_ids,
                start_hour: timeSelection.start_hour,
                end_hour: timeSelection.end_hour,
                account_id: timeSelection.account_id,
              }}
              filename={filename.replace(/-第\d+页\.csv$/, "-筛选数据.csv")}
              columns={csvColumns}
            />
          }
        />

        <PresetToolbar label="产品:">
          <Suspense fallback={null}>
            <DatasetTabs counts={counts} />
          </Suspense>
        </PresetToolbar>

        <TimeRangeResults result={result} previousHref={previousHref} nextHref={nextHref} />
      </div>
    );
  }

  const filter = baseFilter;

  const [counts, anchorLabels, kpi] = await Promise.all([
    queryDatasetCounts(filter),
    queryAnchorLabels(filter),
    queryKpiSummary(filter),
  ]);

  const showChart = sp.chart === "1";
  const view = sp.view === "table" ? "table" : "cards"; // 默认卡片

  interface CsvCol {
    key: string;
    label: string;
  }

  async function buildViewData() {
    const [rows, subAccounts, checkinByLabel] = await Promise.all([
      querySummaryExt(filter),
      querySubAccountsAll(filter),
      view === "cards"
        ? queryCheckinByAccount(filter)
        : Promise.resolve<Record<string, CheckinSlot[]>>({}),
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
    // filter / 视图变化时整组件 remount（清空 expanded / hourlyMap 客户端缓存）
    const filterKey = `${view}|${filter.date_from}|${filter.date_to}|${(filter.dataset_ids ?? []).join(",")}|${filter.search ?? ""}|${filter.anchor_label ?? ""}`;
    const tableContent =
      view === "cards" ? (
        <SummaryCards
          key={filterKey}
          rows={rows}
          subAccounts={subAccounts}
          checkinByLabel={checkinByLabel}
          filter={filter}
        />
      ) : (
        <SummaryTable key={filterKey} rows={rows} subAccounts={subAccounts} filter={filter} />
      );
    return { tableContent, csvRows, csvColumns, csvFilename };
  }

  const { tableContent, csvRows, csvColumns, csvFilename } = await buildViewData();

  const trendData = showChart ? await queryTrend(filter) : [];

  return (
    <div className="space-y-3">
      <PresetToolbar label="视图:">
        <Suspense fallback={null}>
          <PlacementTabs current="summary" />
        </Suspense>
      </PresetToolbar>

      {/* 全局筛选：日期 + 搜索 + 操作（最上面） */}
      <DataToolbar
        filters={
          <Suspense fallback={null}>
            <FilterBar anchorLabels={anchorLabels} />
          </Suspense>
        }
        actions={
          <>
            <ViewToggleLink view={view} sp={sp as Record<string, string>} />
            <ChartToggleLink showChart={showChart} sp={sp as Record<string, string>} />
            <CsvExportButton rows={csvRows} filename={csvFilename} columns={csvColumns} />
          </>
        }
      />

      {/* dataset tabs（在 KPI 之前，跟主播明细的预设标签同位置） */}
      <PresetToolbar label="预设:">
        <Suspense fallback={null}>
          <DatasetTabs counts={counts} />
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

function buildTimeRangePageHref(
  searchParams: Record<string, string | string[] | undefined>,
  page: number,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
  }
  if (page <= 1) params.delete("page");
  else params.set("page", String(page));
  return `/placements?${params.toString()}`;
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

function ViewToggleLink({ view, sp }: { view: "cards" | "table"; sp: Record<string, string> }) {
  const usp = new URLSearchParams(sp);
  if (view === "cards") {
    usp.set("view", "table");
  } else {
    usp.delete("view"); // 回默认（卡片）
  }
  return (
    <a
      href={`/placements?${usp.toString()}`}
      className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
    >
      {view === "cards" ? "表格视图" : "卡片视图"}
    </a>
  );
}
