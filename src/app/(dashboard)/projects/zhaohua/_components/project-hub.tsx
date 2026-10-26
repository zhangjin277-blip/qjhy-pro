"use client";
import { DateRangePicker } from "@/components/patterns/date-range-picker";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  ClipboardList,
  FolderKanban,
  LayoutDashboard,
  MonitorPlay,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type {
  DashboardOverviewResponse,
  GroupCellValue,
  Section2Metric,
} from "@/modules/dashboard";
import { BusinessLineView, ExecutionView, TeamView } from "./project-views";
import { OfficialAdDataPanel } from "./official-ad-data-panel";
import { classifyAdHour, type HourlyAdRow } from "../_lib/ad-schedule-attribution";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ViewKey = "overview" | "ecosystem" | "official" | "ad" | "execution" | "team";
type DatePreset = "last7" | "last30" | "thisMonth" | "prevMonth";

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "last7", label: "近 7 日" },
  { key: "last30", label: "近 30 日" },
  { key: "thisMonth", label: "本月" },
  { key: "prevMonth", label: "上月" },
];

const VIEWS: { key: ViewKey; label: string; icon: LucideIcon }[] = [
  { key: "overview", label: "项目总览", icon: LayoutDashboard },
  { key: "ecosystem", label: "线下主播", icon: UsersRound },
  { key: "official", label: "官号直播", icon: MonitorPlay },
  { key: "ad", label: "投放数据", icon: BarChart3 },
  { key: "execution", label: "执行计划", icon: ClipboardList },
  { key: "team", label: "团队协作", icon: FolderKanban },
];

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function presetToRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (preset === "thisMonth") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      from: toIsoDate(first),
      to: toIsoDate(yesterday < first ? first : yesterday),
    };
  }
  if (preset === "prevMonth") {
    return {
      from: toIsoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  const daysBack = preset === "last7" ? 6 : 29;
  const from = new Date(
    yesterday.getFullYear(),
    yesterday.getMonth(),
    yesterday.getDate() - daysBack,
  );
  return { from: toIsoDate(from), to: toIsoDate(yesterday) };
}

function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100_000_000) return `${(value / 100_000_000).toFixed(2).replace(/\.00$/, "")}亿`;
  if (abs >= 10_000) return `${(value / 10_000).toFixed(2).replace(/\.00$/, "")}万`;
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
}

function getProjectCell(
  data: DashboardOverviewResponse | null,
  metric: Section2Metric,
  group: "total" | "online" | "offline" | "other" = "total",
): GroupCellValue | null {
  return data?.breakdown.find((row) => row.metric === metric)?.zhaohua[group] ?? null;
}

interface AdSummary {
  cost: number;
  clicks: number;
  added: number;
  addedCost: number | null;
  clickRate: number | null;
  anchorCount?: number;
}
type TrendMetric =
  | "flow"
  | "fan"
  | "anchors"
  | "activate"
  | "cost"
  | "clicks"
  | "added"
  | "addedCost"
  | "clickRate";
type TrendSeries = Record<TrendMetric, number[]>;
function emptyTrendSeries(): TrendSeries {
  return {
    flow: [],
    fan: [],
    anchors: [],
    activate: [],
    cost: [],
    clicks: [],
    added: [],
    addedCost: [],
    clickRate: [],
  };
}
function dateLabels(from: string, to: string, length: number): string[] {
  if (length === 0) return [];
  const start = new Date(`${from}T00:00:00`);
  return Array.from({ length }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date <= new Date(`${to}T23:59:59`)
      ? `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
      : "";
  });
}

function formatAdMoney(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `¥${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

function formatAdCount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("zh-CN");
}

function OverviewDataBlock({
  title,
  description,
  tone,
  metrics,
  loading,
  onOpen,
  selected,
  onSelect,
}: {
  title: string;
  description: string;
  tone: "emerald" | "amber" | "violet";
  metrics: { label: string; value: string; hint?: string }[];
  loading?: boolean;
  onOpen?: () => void;
  selected?: boolean;
  onSelect?: () => void;
}): React.JSX.Element {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200/80 bg-emerald-50/30"
      : tone === "amber"
        ? "border-amber-200/80 bg-amber-50/30"
        : "border-violet-200/80 bg-violet-50/30";
  return (
    <article
      onClick={onSelect}
      className={`min-w-0 cursor-pointer rounded-xl border p-4 ${toneClass} ${selected ? "ring-2 ring-primary/30" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            className="shrink-0 text-xs font-medium text-primary hover:text-primary/80"
          >
            查看明细 →
          </button>
        ) : null}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-lg border border-white/80 bg-white/80 px-3 py-2.5"
          >
            <div className="truncate text-[11px] text-slate-500">{metric.label}</div>
            <div className="mt-1 truncate text-[16px] font-semibold tabular-nums text-slate-900">
              {loading ? "…" : metric.value}
            </div>
            {metric.hint ? (
              <div className="mt-0.5 truncate text-[10px] text-slate-400">{metric.hint}</div>
            ) : null}
          </div>
        ))}
      </div>
    </article>
  );
}

export function ProjectHub(): React.JSX.Element {
  const [view, setView] = useState<ViewKey>("overview");
  const [preset, setPreset] = useState<DatePreset | "custom">("last7");
  const [data, setData] = useState<DashboardOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [officialAd, setOfficialAd] = useState<AdSummary | null>(null);
  const [individualAd, setIndividualAd] = useState<AdSummary | null>(null);
  const [adTrend, setAdTrend] = useState<{ official: TrendSeries; individual: TrendSeries }>({
    official: emptyTrendSeries(),
    individual: emptyTrendSeries(),
  });
  const [adLoading, setAdLoading] = useState(true);
  const [range, setRange] = useState(() => presetToRange("last7"));
  const handlePresetChange = (nextPreset: DatePreset) => {
    setPreset(nextPreset);
    setRange(presetToRange(nextPreset));
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/dashboard?date_from=${range.from}&date_to=${range.to}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `HTTP ${response.status}`);
        }
        return response.json() as Promise<DashboardOverviewResponse>;
      })
      .then(setData)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "项目数据加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [range.from, range.to]);

  useEffect(() => {
    const controller = new AbortController();
    setAdLoading(true);
    const officialPromise = Promise.all([
      fetch("/api/projects/zhaohua/official-ad-data/import", {
        signal: controller.signal,
        cache: "no-store",
      }).then((response) =>
        response.ok ? response.json() : Promise.reject(new Error("official")),
      ),
      fetch("/api/projects/zhaohua/shared-state/official_shifts", {
        signal: controller.signal,
        cache: "no-store",
      }).then((response) => (response.ok ? response.json() : { payload: [] })),
      fetch("/api/projects/zhaohua/shared-state/ecology_roster", {
        signal: controller.signal,
        cache: "no-store",
      }).then((response) => (response.ok ? response.json() : { payload: { anchors: [] } })),
    ])
      .then(([body, officialBody, rosterBody]) => {
        const officialShifts = Array.isArray(officialBody.payload) ? officialBody.payload : [];
        const auctionRoster = Array.isArray(rosterBody.payload?.anchors)
          ? rosterBody.payload.anchors
          : [];
        const unique = new Map<string, HourlyAdRow>();
        for (const state of body.states ?? []) {
          for (const row of state.payload?.rows ?? []) {
            const normalized = { ...row, date: state.payload?.date ?? row.date };
            if (
              !normalized.date ||
              (normalized.date >= range.from && normalized.date <= range.to)
            ) {
              unique.set(
                `${normalized.date ?? "unknown"}-${normalized.hour ?? unique.size}`,
                normalized,
              );
            }
          }
        }
        const summarize = (rows: HourlyAdRow[]): AdSummary => {
          const cost = rows.reduce((sum, row) => sum + Number(row.cost ?? 0), 0);
          const clicks = rows.reduce((sum, row) => sum + Number(row.clicks ?? 0), 0);
          const added = rows.reduce((sum, row) => sum + Number(row.added ?? 0), 0);
          const exposure = rows.reduce((sum, row) => sum + Number(row.exposure ?? 0), 0);
          return {
            cost,
            clicks,
            added,
            addedCost: added ? cost / added : null,
            clickRate: exposure ? clicks / exposure : null,
          };
        };
        const classified = Array.from(unique.values());
        const officialRows = classified.filter(
          (row) => classifyAdHour(row, officialShifts, auctionRoster) === "official",
        );
        const individualRows = classified.filter(
          (row) => classifyAdHour(row, officialShifts, auctionRoster) === "individual",
        );
        setOfficialAd(summarize(officialRows));
        setIndividualAd(summarize(individualRows));
        const dailySeries = (rows: HourlyAdRow[]): TrendSeries => {
          const grouped = new Map<string, HourlyAdRow[]>();
          for (const row of rows) {
            const list = grouped.get(row.date ?? "") ?? [];
            list.push(row);
            grouped.set(row.date ?? "", list);
          }
          const days = [...grouped.keys()].sort();
          const sum = (day: string, key: keyof HourlyAdRow) =>
            (grouped.get(day) ?? []).reduce((total, row) => total + Number(row[key] ?? 0), 0);
          const costs = days.map((day) => sum(day, "cost"));
          const clicks = days.map((day) => sum(day, "clicks"));
          const added = days.map((day) => sum(day, "added"));
          return {
            flow: costs,
            fan: costs,
            anchors: [],
            activate: [],
            cost: costs,
            clicks,
            added,
            addedCost: costs.map((value, index) =>
              added[index] ? value / (added[index] ?? 1) : 0,
            ),
            clickRate: costs.map(() => 0),
          };
        };
        setAdTrend({
          official: dailySeries(officialRows),
          individual: dailySeries(individualRows),
        });
      })
      .catch(() => {
        setOfficialAd(null);
        setIndividualAd(null);
        setAdTrend({ official: emptyTrendSeries(), individual: emptyTrendSeries() });
      });
    officialPromise.finally(() => {
      if (!controller.signal.aborted) setAdLoading(false);
    });
    return () => controller.abort();
  }, [range.from, range.to]);

  return (
    <div className="min-w-0 space-y-4 px-1 py-1 md:px-1.5 md:py-1.5">
      <header className="border-b border-slate-200 pb-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
          <span>造化仙府</span>
          <span aria-hidden="true">/</span>
          <span className="text-slate-700">造化直播</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-900">造化直播</h1>
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                运营中
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>发行项目</span>
              <span>线下主播 / 官号直播</span>
              <span>长沙执行 / 恒星协作</span>
            </div>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
          >
            <BarChart3 className="size-4" />
            完整业务数据
          </Link>
        </div>
      </header>

      <div
        className="overflow-x-auto border-b border-slate-200"
        role="tablist"
        aria-label="项目视图"
      >
        <div className="flex min-w-max gap-1">
          {VIEWS.map((item) => {
            const Icon = item.icon;
            const active = view === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setView(item.key)}
                className={cn(
                  "relative inline-flex h-10 items-center gap-1.5 px-3 text-sm font-medium transition-colors",
                  active ? "text-primary" : "text-slate-500 hover:text-slate-800",
                )}
              >
                <Icon className="size-4" />
                {item.label}
                {active ? <span className="absolute inset-x-2 bottom-0 h-0.5 bg-primary" /> : null}
              </button>
            );
          })}
        </div>
      </div>

      {view === "overview" ? (
        <ProjectOverview
          data={data}
          loading={loading}
          error={error}
          preset={preset}
          onPresetChange={handlePresetChange}
          onRangeChange={(nextRange) => {
            setPreset("custom");
            setRange(nextRange);
          }}
          range={range}
          officialAd={officialAd}
          individualAd={individualAd}
          adTrend={adTrend}
          adLoading={adLoading}
          onOpenView={setView}
        />
      ) : null}
      {view === "ecosystem" ? (
        <BusinessLineView kind="ecosystem" dateFrom={range.from} dateTo={range.to} />
      ) : null}
      {view === "official" ? (
        <BusinessLineView kind="official" dateFrom={range.from} dateTo={range.to} />
      ) : null}
      {view === "ad" ? <OfficialAdDataPanel /> : null}
      {view === "execution" ? <ExecutionView /> : null}
      {view === "team" ? <TeamView /> : null}
    </div>
  );
}

function ProjectOverview({
  data,
  loading,
  error,
  preset,
  onPresetChange,
  onRangeChange,
  range,
  officialAd,
  individualAd,
  adTrend,
  adLoading,
  onOpenView,
}: {
  data: DashboardOverviewResponse | null;
  loading: boolean;
  error: string | null;
  preset: DatePreset | "custom";
  onPresetChange: (preset: DatePreset) => void;
  onRangeChange: (range: { from: string; to: string }) => void;
  range: { from: string; to: string };
  officialAd: AdSummary | null;
  individualAd: AdSummary | null;
  adTrend: { official: TrendSeries; individual: TrendSeries };
  adLoading: boolean;
  onOpenView: (view: ViewKey) => void;
}): React.JSX.Element {
  const [selectedTrend, setSelectedTrend] = useState<"offline" | "official" | "individual">(
    "offline",
  );
  const [offlineMetric, setOfflineMetric] = useState<TrendMetric>("flow");
  const [officialMetric, setOfficialMetric] = useState<TrendMetric>("cost");
  const [individualMetric, setIndividualMetric] = useState<TrendMetric>("cost");
  const zhaohuaMetric = (key: Section2Metric): GroupCellValue | null => getProjectCell(data, key);
  const offlineFlowCell = getProjectCell(data, "flow", "offline");
  const offlineFanCell = getProjectCell(data, "total_fan_ticket", "offline");
  const offlineActiveCell = getProjectCell(data, "active_anchor_count", "offline");
  const offlineActivateCell = getProjectCell(data, "install_or_activate", "offline");
  const zhaohuaFlow = zhaohuaMetric("flow");
  const zhaohuaFan = zhaohuaMetric("total_fan_ticket");
  const zhaohuaActive = zhaohuaMetric("active_anchor_count");
  const zhaohuaWatch = zhaohuaMetric("watch_uv");
  const zhaohuaActivate = zhaohuaMetric("install_or_activate");
  return (
    <div className="space-y-5">
      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="size-4 shrink-0" />
          数据加载失败：{error}
        </div>
      ) : null}
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">项目数据分块</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {range.from} 至 {range.to} · 按线下主播、投放官号、投放个播分别查看核心指标
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg bg-slate-100 p-1" role="group" aria-label="统计周期">
              {DATE_PRESETS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onPresetChange(item.key)}
                  className={cn(
                    "h-7 rounded-md px-2.5 text-xs font-medium transition",
                    preset === item.key
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <DateRangePicker
                label="统计日期"
                value={{ from: range.from, to: range.to }}
                onChange={(next) => onRangeChange(next)}
              />
            </div>
          </div>
        </div>
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.7fr)]">
          <div className="grid min-w-0 gap-3">
            <OverviewDataBlock
              title="线下主播"
              description="主播经营与游戏推广表现"
              tone="emerald"
              onOpen={() => onOpenView("ecosystem")}
              loading={loading}
              selected={selectedTrend === "offline"}
              onSelect={() => setSelectedTrend("offline")}
              metrics={[
                { label: "项目流水", value: zhaohuaFlow ? formatAdMoney(zhaohuaFlow.value) : "—" },
                { label: "音浪流水", value: zhaohuaFan ? formatCompact(zhaohuaFan.value) : "—" },
                {
                  label: "开播主播",
                  value: zhaohuaActive ? `${formatAdCount(zhaohuaActive.value)} 人` : "—",
                },
                {
                  label: "挂摇杆主播",
                  value:
                    offlineFlowCell?.rod_anchor_count == null
                      ? "—"
                      : `${formatAdCount(offlineFlowCell.rod_anchor_count)} 人`,
                  hint: "开播时长与小游戏开播时长均大于 0",
                },
                {
                  label: "进房人数",
                  value: zhaohuaWatch ? `${formatAdCount(zhaohuaWatch.value)} 人` : "—",
                },
                {
                  label: "激活",
                  value: zhaohuaActivate ? `${formatAdCount(zhaohuaActivate.value)} 人` : "—",
                },
              ]}
            />
            <OverviewDataBlock
              title="投放官号"
              description="官号投放消耗与拉新效率"
              tone="amber"
              onOpen={() => onOpenView("ad")}
              loading={adLoading}
              selected={selectedTrend === "official"}
              onSelect={() => setSelectedTrend("official")}
              metrics={[
                { label: "消耗", value: formatAdMoney(officialAd?.cost ?? null) },
                { label: "点击", value: formatAdCount(officialAd?.clicks ?? null) },
                { label: "新增", value: formatAdCount(officialAd?.added ?? null) },
                { label: "新增成本", value: formatAdMoney(officialAd?.addedCost ?? null) },
                {
                  label: "点击率",
                  value:
                    officialAd?.clickRate == null
                      ? "—"
                      : `${(officialAd.clickRate * 100).toFixed(2)}%`,
                },
              ]}
            />
            <OverviewDataBlock
              title="投放个播"
              description="个播账号投放消耗与拉新效率"
              tone="violet"
              onOpen={() => onOpenView("ad")}
              loading={adLoading}
              selected={selectedTrend === "individual"}
              onSelect={() => setSelectedTrend("individual")}
              metrics={[
                { label: "消耗", value: formatAdMoney(individualAd?.cost ?? null) },
                { label: "点击", value: formatAdCount(individualAd?.clicks ?? null) },
                { label: "新增", value: formatAdCount(individualAd?.added ?? null) },
                { label: "新增成本", value: formatAdMoney(individualAd?.addedCost ?? null) },
                {
                  label: "点击率",
                  value:
                    individualAd?.clickRate == null
                      ? "—"
                      : `${(individualAd.clickRate * 100).toFixed(2)}%`,
                },
              ]}
            />
          </div>
          <div className="grid gap-3">
            <TrendPanel
              title="线下主播趋势"
              values={
                (offlineMetric === "flow"
                  ? offlineFlowCell?.sparkline
                  : offlineMetric === "fan"
                    ? offlineFanCell?.sparkline
                    : offlineMetric === "anchors"
                      ? offlineActiveCell?.sparkline
                      : offlineActivateCell?.sparkline) ?? []
              }
              labels={dateLabels(
                range.from,
                range.to,
                (
                  (offlineMetric === "flow"
                    ? offlineFlowCell?.sparkline
                    : offlineMetric === "fan"
                      ? offlineFanCell?.sparkline
                      : offlineMetric === "anchors"
                        ? offlineActiveCell?.sparkline
                        : offlineActivateCell?.sparkline) ?? []
                ).length,
              )}
              metric={offlineMetric}
              onMetricChange={setOfflineMetric}
              metrics={[
                { key: "flow", label: "项目流水" },
                { key: "fan", label: "音浪流水" },
                { key: "anchors", label: "开播主播" },
                { key: "activate", label: "激活" },
              ]}
              loading={loading}
            />
            <TrendPanel
              title="官号投放趋势"
              values={adTrend.official[officialMetric]}
              labels={dateLabels(range.from, range.to, adTrend.official[officialMetric].length)}
              metric={officialMetric}
              onMetricChange={setOfficialMetric}
              metrics={[
                { key: "cost", label: "消耗" },
                { key: "clicks", label: "点击" },
                { key: "added", label: "新增" },
                { key: "addedCost", label: "新增成本" },
              ]}
              loading={adLoading}
            />
            <TrendPanel
              title="个播投放趋势"
              values={adTrend.individual[individualMetric]}
              labels={dateLabels(range.from, range.to, adTrend.individual[individualMetric].length)}
              metric={individualMetric}
              onMetricChange={setIndividualMetric}
              metrics={[
                { key: "cost", label: "消耗" },
                { key: "clicks", label: "点击" },
                { key: "added", label: "新增" },
                { key: "addedCost", label: "新增成本" },
              ]}
              loading={adLoading}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function TrendPanel({
  values,
  labels,
  loading,
  title = "趋势",
  metrics,
  metric,
  onMetricChange,
}: {
  values: number[];
  labels: string[];
  loading: boolean;
  title?: string;
  metrics?: { key: TrendMetric; label: string }[];
  metric?: TrendMetric;
  onMetricChange?: (metric: TrendMetric) => void;
}): React.JSX.Element {
  const chartData = values.map((value, index) => ({
    date: labels[index] ?? `${index + 1}`,
    value,
  }));
  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">当前统计周期 · 项目总口径</p>
        </div>
        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
          <CalendarDays className="size-3.5" />
          按日
        </span>
      </div>
      {metrics && onMetricChange ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {metrics.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onMetricChange(item.key)}
              className={cn(
                "rounded-md px-2 py-1 text-[11px]",
                metric === item.key
                  ? "bg-blue-50 text-blue-700"
                  : "bg-slate-50 text-slate-500 hover:bg-slate-100",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-4 h-44 min-w-0 overflow-hidden rounded-md bg-slate-50 px-2 py-3">
        {loading ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            数据加载中
          </div>
        ) : values.length < 2 ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            暂无趋势数据
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient
                  id={`trend-${title.replaceAll(" ", "-")}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#5270ff" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#5270ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 5" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                minTickGap={18}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                width={42}
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                formatter={(value) => [
                  typeof value === "number"
                    ? value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })
                    : "—",
                  "数值",
                ]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#5270ff"
                strokeWidth={2.5}
                fill={`url(#trend-${title.replaceAll(" ", "-")})`}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
