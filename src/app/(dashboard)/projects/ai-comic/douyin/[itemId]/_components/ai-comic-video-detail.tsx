"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Clock3,
  Film,
  Heart,
  MessageCircle,
  Percent,
  Play,
  Share2,
  Sparkles,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Video {
  item_id: string;
  created_at?: string;
  publish_time: string;
  description: string | null;
  cover_url: string | null;
  duration_ms: number | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  share_count: number | null;
  favorite_count: number | null;
  danmaku_count: number | null;
  subscribe_count: number | null;
  unsubscribe_count: number | null;
  raw?: Record<string, unknown> | null;
  avg_view_second: string | null;
  avg_view_proportion: string | null;
  completion_rate: string | null;
  completion_rate_5s: string | null;
  bounce_rate_2s: string | null;
  cover_click_rate: string | null;
}

interface HourlyPoint {
  item_id: string;
  metric_type: number;
  point_at: string;
  value: string;
}

interface ChartPoint {
  axis: string;
  value: number;
}

function formatAxisDate(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const month = parts.find((part) => part.type === "month")?.value ?? "--";
  const day = parts.find((part) => part.type === "day")?.value ?? "--";
  return `${month}-${day}`;
}

function formatAxisHour(value: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const hour = parts.find((part) => part.type === "hour")?.value ?? "--";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "--";
  return `${hour}:${minute}`;
}

function sevenAxisTicks(data: ChartPoint[]): string[] {
  if (data.length <= 7) return data.map((point) => point.axis);
  return Array.from({ length: 7 }, (_, index) => {
    const dataIndex = Math.round((index * (data.length - 1)) / 6);
    return data[dataIndex]?.axis ?? data[0]?.axis ?? "";
  });
}

function ChartXAxisTick({
  x = 0,
  y = 0,
  payload,
  showHour,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
  showHour: boolean;
}): React.JSX.Element {
  const value = payload?.value ?? "";
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" fill="#94a3b8" fontSize={10}>
        <tspan x="0" dy="12">
          {formatAxisDate(value)}
        </tspan>
        {showHour ? (
          <tspan x="0" dy="14">
            {formatAxisHour(value)}
          </tspan>
        ) : null}
      </text>
    </g>
  );
}

const compact = (value: number | null | undefined) => {
  if (value == null) return "--";
  return value >= 10000
    ? `${(value / 10000).toFixed(1)}万`
    : new Intl.NumberFormat("zh-CN").format(value);
};
const percentage = (value: string | null | undefined) => {
  if (value == null || value === "") return "--";
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 100).toFixed(2)}%` : "--";
};

export function AiComicVideoDetail({
  itemId,
  platform = "douyin",
}: {
  itemId: string;
  platform?: "douyin" | "kuaishou" | "wechat";
}): React.JSX.Element {
  const [video, setVideo] = useState<Video | null>(null);
  const [history, setHistory] = useState<Video[]>([]);
  const [hourlyHistory, setHourlyHistory] = useState<HourlyPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flowMetric, setFlowMetric] = useState("view_count");
  const [fanMetric, setFanMetric] = useState("subscribe_count");
  const [flowMode, setFlowMode] = useState<"new" | "total">("new");
  const [fanMode, setFanMode] = useState<"new" | "total">("new");
  const [flowGrain, setFlowGrain] = useState<"hour" | "day">("hour");
  const [fanGrain, setFanGrain] = useState<"hour" | "day">("hour");

  useEffect(() => {
    void fetch(
      `/api/projects/ai-comic/${platform}?item_id=${encodeURIComponent(itemId)}&from=2000-01-01`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as {
          videos: Video[];
          history: Video[];
          hourlyHistory: HourlyPoint[];
        };
      })
      .then((data) => {
        setVideo(data.videos[0] ?? null);
        setHistory(data.history ?? []);
        setHourlyHistory(data.hourlyHistory ?? []);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "读取失败"));
  }, [itemId, platform]);

  const chronologicalHistory = useMemo(() => history.slice().reverse(), [history]);

  const rawMetric = (row: Video, key: string): number | null => {
    if (key === "fan_view_proportion") {
      const metrics = row.raw?.metrics;
      const value =
        metrics && typeof metrics === "object" ? (metrics as Record<string, unknown>)[key] : null;
      const number = typeof value === "number" ? value : Number(value);
      return Number.isFinite(number) ? number : null;
    }
    const value = row[key as keyof Video];
    return typeof value === "number" ? value : value == null ? null : Number(value);
  };

  const buildSnapshotChartData = (metric: string, mode: "new" | "total") =>
    chronologicalHistory.map((row, index) => {
      const total = rawMetric(row, metric) ?? 0;
      const previousRow = index > 0 ? chronologicalHistory[index - 1] : undefined;
      const previous = previousRow ? (rawMetric(previousRow, metric) ?? 0) : 0;
      const isRate = rateMetrics.has(metric);
      return {
        axis: row.created_at ?? row.publish_time,
        value: mode === "new" && !isRate ? Math.max(0, total - previous) : total,
      };
    });

  const hourlyMetricType: Record<string, number> = {
    view_count: 1,
    like_count: 3,
    comment_count: 4,
    share_count: 5,
    subscribe_count: 9,
    completion_rate_5s: 7,
  };
  const rateMetrics = new Set(["fan_view_proportion", "completion_rate_5s", "bounce_rate_2s"]);
  const buildHourlyChartData = (metric: string, mode: "new" | "total") => {
    const metricType = hourlyMetricType[metric];
    if (!metricType) return [];
    const rows = hourlyHistory.filter((row) => row.metric_type === metricType);
    return rows.map((row, index) => {
      const total = Number(row.value);
      const previous = index > 0 ? Number(rows[index - 1]?.value ?? 0) : 0;
      return {
        axis: row.point_at,
        value: mode === "new" && !rateMetrics.has(metric) ? Math.max(0, total - previous) : total,
      };
    });
  };

  const buildDailyChartData = (metric: string, mode: "new" | "total") => {
    const metricType = hourlyMetricType[metric];
    if (!metricType) return buildSnapshotChartData(metric, mode);
    const dailyLast = new Map<string, HourlyPoint>();
    for (const row of hourlyHistory) {
      if (row.metric_type !== metricType) continue;
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(
        new Date(row.point_at),
      );
      dailyLast.set(day, row);
    }
    const rows = [...dailyLast.values()];
    return rows.map((row, index) => {
      const total = Number(row.value);
      const previous = index > 0 ? Number(rows[index - 1]?.value ?? 0) : 0;
      return {
        axis: row.point_at,
        value: mode === "new" && !rateMetrics.has(metric) ? Math.max(0, total - previous) : total,
      };
    });
  };

  if (error) return <div className="p-8 text-sm text-rose-600">读取失败：{error}</div>;
  if (!video)
    return (
      <div className="flex min-h-[400px] items-center justify-center text-sm text-slate-400">
        作品数据加载中…
      </div>
    );

  const flowMetrics = [
    ["播放", "view_count", video.view_count, Play],
    ["点赞", "like_count", video.like_count, Heart],
    ["评论", "comment_count", video.comment_count, MessageCircle],
    ["分享", "share_count", video.share_count, Share2],
    ["收藏", "favorite_count", video.favorite_count, Sparkles],
    ["弹幕", "danmaku_count", video.danmaku_count, BarChart3, false],
    ["完播率", "completion_rate_5s", video.completion_rate_5s, Percent, true],
    ["2s跳出率", "bounce_rate_2s", video.bounce_rate_2s, Percent, true],
  ] as const;
  const fanViewProportion = rawMetric(video, "fan_view_proportion");
  const fanMetrics = [
    ["涨粉", "subscribe_count", video.subscribe_count, Users, false],
    ["脱粉", "unsubscribe_count", video.unsubscribe_count, Users, false],
    ["粉丝播放占比", "fan_view_proportion", fanViewProportion, Users, true],
  ] as const;

  const chartLabel = (metric: string) =>
    [...flowMetrics, ...fanMetrics].find((item) => item[1] === metric)?.[0] ?? "数据";
  const chartFormatter = (metric: string) =>
    rateMetrics.has(metric)
      ? (value: number) => percentage(String(value))
      : (value: number) => compact(value);

  return (
    <main className="min-h-full bg-[#f5f7fa] text-slate-900">
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        <Link
          href="/projects/ai-comic"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="size-4" /> 返回 AI漫剧
        </Link>
        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row">
            <div className="relative h-48 w-32 shrink-0 overflow-hidden rounded-lg bg-slate-100 shadow-sm sm:h-56 sm:w-[150px]">
              {video.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={video.cover_url} alt="" className="size-full object-cover" />
              ) : (
                <Film className="m-14 size-8 text-slate-300" />
              )}
              {video.duration_ms ? (
                <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">
                  {Math.round(video.duration_ms / 1000 / 60)}:
                  {String(Math.round(video.duration_ms / 1000) % 60).padStart(2, "0")}
                </span>
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded bg-slate-900 px-2 py-1 text-white">抖音</span>
                <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-600">已发布</span>
              </div>
              <h1 className="mt-3 text-xl font-semibold leading-7 text-slate-950">
                {video.description || "未命名作品"}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="size-3.5" />
                  {new Date(video.publish_time).toLocaleString("zh-CN", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="size-3.5" />
                  均看{" "}
                  {video.avg_view_second ? `${Number(video.avg_view_second).toFixed(0)} 秒` : "--"}
                </span>
              </div>
              <div className="mt-6 text-xs text-slate-400">作品 ID：{video.item_id}</div>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-2">
          {(
            [
              {
                title: "流量",
                subtitle: "作品互动与播放表现",
                metrics: flowMetrics,
                selected: flowMetric,
                setSelected: setFlowMetric,
                mode: flowMode,
                setMode: setFlowMode,
                grain: flowGrain,
                setGrain: setFlowGrain,
                data: buildDailyChartData(flowMetric, flowMode),
                hourlyData: buildHourlyChartData(flowMetric, flowMode),
                color: "#2563eb",
                gradient: "video-detail-flow",
              },
              {
                title: "粉丝",
                subtitle: "涨粉、脱粉与粉丝播放占比",
                metrics: fanMetrics,
                selected: fanMetric,
                setSelected: setFanMetric,
                mode: fanMode,
                setMode: setFanMode,
                grain: fanGrain,
                setGrain: setFanGrain,
                data: buildDailyChartData(fanMetric, fanMode),
                hourlyData: buildHourlyChartData(fanMetric, fanMode),
                color: "#7c3aed",
                gradient: "video-detail-fan",
              },
            ] as const
          ).map((panel) => (
            <section
              key={panel.title}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{panel.title}</h2>
                  <p className="mt-1 text-xs text-slate-500">{panel.subtitle}</p>
                </div>
                <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] text-slate-400">
                  {panel.grain === "hour" ? "每小时" : "每天"}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {panel.metrics.map(([label, metric, value, Icon, isRate]) => (
                  <button
                    key={metric}
                    type="button"
                    onClick={() => panel.setSelected(metric)}
                    className={`rounded-lg border px-3 py-3 text-left transition ${
                      panel.selected === metric
                        ? "border-[#d8e3ff] bg-[#eef3ff] text-slate-900 shadow-sm ring-2 ring-[#e6edff]"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    <span
                      className={`flex items-center gap-1.5 text-xs ${panel.selected === metric ? "text-blue-700" : "text-slate-500"}`}
                    >
                      <Icon className="size-3.5" /> {label}
                    </span>
                    <span className="mt-1.5 block text-lg font-semibold tabular-nums">
                      {isRate ? percentage(value == null ? null : String(value)) : compact(value)}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-slate-800">
                    {chartLabel(panel.selected)}趋势
                  </h3>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    鼠标悬停可查看{panel.grain === "hour" ? "当小时" : "当天"}数值
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center rounded-md bg-slate-100 p-0.5 text-[11px]">
                    {(["new", "total"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => panel.setMode(mode)}
                        className={`rounded px-2.5 py-1 ${panel.mode === mode ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-500"}`}
                      >
                        {mode === "new" ? "新增" : "累计"}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center rounded-md bg-slate-100 p-0.5 text-[11px]">
                    {(["hour", "day"] as const).map((grain) => (
                      <button
                        key={grain}
                        type="button"
                        onClick={() => panel.setGrain(grain)}
                        className={`rounded px-2.5 py-1 ${panel.grain === grain ? "bg-white font-medium text-slate-900" : "text-slate-500"}`}
                      >
                        {grain === "hour" ? "每小时" : "每天"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-2 h-56">
                {panel.grain === "hour" && panel.hourlyData.length < 1 ? (
                  <div className="flex h-full items-center justify-center rounded-lg bg-slate-50 px-5 text-center text-xs text-slate-400">
                    暂无该指标的小时级历史快照，切换“每天”查看按日数据
                  </div>
                ) : (panel.grain === "hour" ? panel.hourlyData : panel.data).length < 1 ? (
                  <div className="flex h-full items-center justify-center rounded-lg bg-slate-50 text-xs text-slate-400">
                    暂无足够的历史快照
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={panel.grain === "hour" ? panel.hourlyData : panel.data}
                      margin={{
                        top: 8,
                        right: 12,
                        left: 0,
                        bottom: panel.grain === "hour" ? 14 : 0,
                      }}
                    >
                      <defs>
                        <linearGradient id={panel.gradient} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={panel.color} stopOpacity={0.2} />
                          <stop offset="100%" stopColor={panel.color} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 5" vertical={false} />
                      <XAxis
                        dataKey="axis"
                        ticks={sevenAxisTicks(
                          panel.grain === "hour" ? panel.hourlyData : panel.data,
                        )}
                        tick={<ChartXAxisTick showHour={panel.grain === "hour"} />}
                        tickLine={false}
                        axisLine={false}
                        interval={0}
                        height={panel.grain === "hour" ? 40 : 26}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#94a3b8" }}
                        tickLine={false}
                        axisLine={false}
                        width={48}
                        tickFormatter={chartFormatter(panel.selected)}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 8,
                          border: "1px solid #e2e8f0",
                          fontSize: 12,
                        }}
                        formatter={(value) => [
                          typeof value === "number" ? chartFormatter(panel.selected)(value) : "--",
                          chartLabel(panel.selected),
                        ]}
                        labelFormatter={(label) =>
                          panel.grain === "hour"
                            ? `${formatAxisDate(String(label))} ${formatAxisHour(String(label))}`
                            : formatAxisDate(String(label))
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke={panel.color}
                        strokeWidth={2.5}
                        fill={`url(#${panel.gradient})`}
                        dot={(panel.grain === "hour" ? panel.hourlyData : panel.data).length === 1}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>
          ))}
        </section>
      </div>
    </main>
  );
}
