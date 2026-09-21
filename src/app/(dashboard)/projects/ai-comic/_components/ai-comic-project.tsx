"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  Clapperboard,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  ListFilter,
  Film,
  Globe2,
  Heart,
  Music2,
  MessageCircle,
  Play,
  Radio,
  Sparkles,
  Tv2,
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

type PlatformKey = "douyin" | "kuaishou" | "xiaohongshu" | "bilibili" | "wechat";
type ViewKey = PlatformKey | "all";
type RangeKey = "7" | "30" | "month" | "all" | "custom";
type MetricKey = "play" | "like" | "comment" | "share" | "fans";
type VideoSortKey = "published" | "views" | "likes";

interface Daily {
  metric_date: string;
  publish_count: number | null;
  play_count: number | null;
  like_count: number | null;
  share_count: number | null;
  comment_count: number | null;
  net_fans_count: number | null;
  collected_at?: string;
}

interface Video {
  platform?: "douyin" | "kuaishou" | "wechat";
  item_id: string;
  publish_time: string;
  description: string | null;
  cover_url: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  share_count: number | null;
  favorite_count: number | null;
  danmaku_count: number | null;
  subscribe_count: number | null;
  avg_view_second: string | null;
  completion_rate: string | null;
  completion_rate_5s: string | null;
}

interface PlatformDefinition {
  key: PlatformKey;
  label: string;
  note: string;
  status: "live" | "planned";
  Icon: typeof Music2;
  accent: string;
  soft: string;
}

const PLATFORMS: PlatformDefinition[] = [
  {
    key: "douyin",
    label: "抖音",
    note: "创作者中心",
    status: "live",
    Icon: Music2,
    accent: "text-slate-950",
    soft: "bg-slate-950",
  },
  {
    key: "kuaishou",
    label: "快手",
    note: "快手数据接口",
    status: "live",
    Icon: Clapperboard,
    accent: "text-orange-700",
    soft: "bg-orange-500",
  },
  {
    key: "xiaohongshu",
    label: "小红书",
    note: "接口接入中",
    status: "planned",
    Icon: BookOpen,
    accent: "text-rose-700",
    soft: "bg-rose-500",
  },
  {
    key: "bilibili",
    label: "B站",
    note: "接口接入中",
    status: "planned",
    Icon: Tv2,
    accent: "text-cyan-700",
    soft: "bg-cyan-500",
  },
  {
    key: "wechat",
    label: "视频号",
    note: "已接入",
    status: "live",
    Icon: MessageCircle,
    accent: "text-emerald-700",
    soft: "bg-emerald-500",
  },
];

const METRICS: { key: MetricKey; label: string; color: string }[] = [
  { key: "play", label: "播放", color: "#111827" },
  { key: "like", label: "点赞", color: "#e11d48" },
  { key: "comment", label: "评论", color: "#2563eb" },
  { key: "share", label: "分享", color: "#d97706" },
  { key: "fans", label: "作品涨粉", color: "#059669" },
];
const DEFAULT_METRIC = METRICS[0] ?? { key: "play" as const, label: "播放", color: "#111827" };
const DEFAULT_PLATFORM = PLATFORMS[0] ?? {
  key: "douyin" as const,
  label: "抖音",
  note: "创作者中心",
  status: "live" as const,
  Icon: Music2,
  accent: "text-slate-950",
  soft: "bg-slate-950",
};

const compact = (value: number | null | undefined) => {
  if (value == null) return "--";
  const absolute = Math.abs(value);
  if (absolute >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return new Intl.NumberFormat("zh-CN").format(value);
};

const percentage = (value: string | number | null | undefined) => {
  if (value == null || value === "") return "--";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${(numeric * 100).toFixed(1)}%` : "--";
};

function beijingDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(date);
}

function dateOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return beijingDate(date);
}

function rangeFor(key: Exclude<RangeKey, "custom">): { from: string; to: string } {
  const to = beijingDate();
  if (key === "7") return { from: dateOffset(-6), to };
  if (key === "30") return { from: dateOffset(-29), to };
  if (key === "all") return { from: "2020-01-01", to };
  const now = new Date();
  return {
    from: beijingDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    to,
  };
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthStart(value: string): Date {
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year || new Date().getFullYear(), (month || 1) - 1, 1));
}

function shiftMonth(value: Date, amount: number): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + amount, 1));
}

function calendarCells(month: Date): (Date | null)[] {
  const firstWeekday = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1),
  ).getUTCDay();
  const daysInMonth = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, index) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), index + 1)),
    ),
  ];
}

function monthLabel(value: Date): string {
  return `${value.getUTCFullYear()}年 ${value.getUTCMonth() + 1}月`;
}

function displayDateRange(from: string, to: string): string {
  return `${from.replaceAll("-", "/")} 至 ${to.replaceAll("-", "/")}`;
}

export function AiComicProject(): React.JSX.Element {
  const [platform, setPlatform] = useState<ViewKey>("all");
  const [rangeKey, setRangeKey] = useState<RangeKey>("all");
  const [range, setRange] = useState(() => rangeFor("all"));
  const [metric, setMetric] = useState<MetricKey>("play");
  const [videoSort, setVideoSort] = useState<VideoSortKey>("published");
  const [videoFrom, setVideoFrom] = useState(() => rangeFor("all").from);
  const [videoTo, setVideoTo] = useState(() => rangeFor("all").to);
  const [videoDateOpen, setVideoDateOpen] = useState(false);
  const [videoDraftFrom, setVideoDraftFrom] = useState(() => rangeFor("all").from);
  const [videoDraftTo, setVideoDraftTo] = useState(() => rangeFor("all").to);
  const [calendarMonth, setCalendarMonth] = useState(() => monthStart(rangeFor("all").from));
  const [page, setPage] = useState(1);
  const [daily, setDaily] = useState<Daily[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [platformPlayTotals, setPlatformPlayTotals] = useState<
    Partial<Record<PlatformKey, number>>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!["douyin", "kuaishou", "wechat", "all"].includes(platform)) return;
    setLoading(true);
    setError(null);
    const endpoints: ("douyin" | "kuaishou" | "wechat")[] = ["douyin", "kuaishou", "wechat"];
    void Promise.all(
      endpoints.map(async (endpoint) => {
        const response = await fetch(
          `/api/projects/ai-comic/${endpoint}?from=${range.from}&to=${range.to}`,
          { cache: "no-store" },
        );
        const body = (await response.json()) as {
          daily?: Daily[];
          videos?: Video[];
          error?: string;
        };
        if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
        return { endpoint, ...(body as { daily: Daily[]; videos: Video[] }) };
      }),
    )
      .then((responses) => {
        const dailyByDate = new Map<string, Daily>();
        const mergedVideos: Video[] = [];
        setPlatformPlayTotals((current) => {
          const next = { ...current };
          for (const response of responses) {
            next[response.endpoint] = response.videos.reduce(
              (sum, video) => sum + (video.view_count ?? 0),
              0,
            );
          }
          return next;
        });
        const selectedResponses =
          platform === "all"
            ? responses
            : responses.filter((response) => response.endpoint === platform);
        for (const response of selectedResponses) {
          for (const row of response.daily) {
            const current = dailyByDate.get(row.metric_date);
            if (!current) {
              dailyByDate.set(row.metric_date, { ...row });
              continue;
            }
            current.publish_count = (current.publish_count ?? 0) + (row.publish_count ?? 0);
            current.play_count = (current.play_count ?? 0) + (row.play_count ?? 0);
            current.like_count = (current.like_count ?? 0) + (row.like_count ?? 0);
            current.comment_count = (current.comment_count ?? 0) + (row.comment_count ?? 0);
            current.share_count = (current.share_count ?? 0) + (row.share_count ?? 0);
            current.net_fans_count = (current.net_fans_count ?? 0) + (row.net_fans_count ?? 0);
          }
          mergedVideos.push(
            ...response.videos.map((video) => ({ ...video, platform: response.endpoint })),
          );
        }
        return {
          daily: [...dailyByDate.values()].sort((a, b) =>
            a.metric_date.localeCompare(b.metric_date),
          ),
          videos: mergedVideos,
        };
      })
      .then((data) => {
        setDaily(data.daily);
        setVideos(data.videos);
        setPage(1);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "读取失败"))
      .finally(() => setLoading(false));
  }, [platform, range.from, range.to]);

  const totals = useMemo(
    () =>
      videos.reduce(
        (sum, video) => ({
          publish: sum.publish + 1,
          play: sum.play + (video.view_count ?? 0),
          like: sum.like + (video.like_count ?? 0),
          comment: sum.comment + (video.comment_count ?? 0),
          share: sum.share + (video.share_count ?? 0),
          fans: sum.fans + (video.subscribe_count ?? 0),
        }),
        { publish: 0, play: 0, like: 0, comment: 0, share: 0, fans: 0 },
      ),
    [videos],
  );
  const interactionRate = totals.play
    ? ((totals.like + totals.comment + totals.share) / totals.play) * 100
    : 0;
  const chartData = useMemo(() => {
    const dailyMetricValue = (row: Daily): number => {
      switch (metric) {
        case "like":
          return row.like_count ?? 0;
        case "comment":
          return row.comment_count ?? 0;
        case "share":
          return row.share_count ?? 0;
        case "fans":
          return row.net_fans_count ?? 0;
        default:
          return row.play_count ?? 0;
      }
    };
    return daily
      .slice()
      .sort((left, right) => left.metric_date.localeCompare(right.metric_date))
      .map((row) => ({ date: row.metric_date.slice(5), value: dailyMetricValue(row) }));
  }, [daily, metric]);
  const selectedMetric = METRICS.find((item) => item.key === metric) ?? DEFAULT_METRIC;
  const selectedPlatform = PLATFORMS.find((item) => item.key === platform) ?? DEFAULT_PLATFORM;
  const isAllPlatform = platform === "all";
  const latestCollectedAt = daily.reduce<string | null>(
    (latest, row) =>
      !latest || (row.collected_at ?? "") > latest ? (row.collected_at ?? latest) : latest,
    null,
  );
  const latestCollectedLabel = latestCollectedAt
    ? new Date(latestCollectedAt).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "等待同步";
  const sortedVideos = useMemo(() => {
    const filtered = videos.filter((video) => {
      const publishDate = beijingDate(new Date(video.publish_time));
      return publishDate >= videoFrom && publishDate <= videoTo;
    });
    return filtered.sort((a, b) => {
      if (videoSort === "views") return (b.view_count ?? 0) - (a.view_count ?? 0);
      if (videoSort === "likes") return (b.like_count ?? 0) - (a.like_count ?? 0);
      return new Date(b.publish_time).getTime() - new Date(a.publish_time).getTime();
    });
  }, [videoFrom, videoSort, videoTo, videos]);
  const pageCount = Math.max(1, Math.ceil(sortedVideos.length / 5));
  const pageVideos = sortedVideos.slice((page - 1) * 5, page * 5);

  useEffect(() => {
    setPage(1);
  }, [videoFrom, videoSort, videoTo]);

  const selectRange = (key: RangeKey) => {
    setRangeKey(key);
    if (key !== "custom") {
      const nextRange = rangeFor(key);
      setRange(nextRange);
      setVideoFrom(nextRange.from);
      setVideoTo(nextRange.to);
      setVideoDraftFrom(nextRange.from);
      setVideoDraftTo(nextRange.to);
      setCalendarMonth(monthStart(nextRange.from));
    }
  };

  const chooseVideoShortcut = (key: "today" | "week" | "month" | "twoMonths" | "all") => {
    const next =
      key === "today"
        ? { from: beijingDate(), to: beijingDate() }
        : key === "week"
          ? rangeFor("7")
          : key === "month"
            ? rangeFor("month")
            : key === "twoMonths"
              ? { from: dateOffset(-59), to: beijingDate() }
              : { from: range.from, to: range.to };
    setVideoFrom(next.from);
    setVideoTo(next.to);
    setVideoDraftFrom(next.from);
    setVideoDraftTo(next.to);
    setCalendarMonth(monthStart(next.from));
    setVideoDateOpen(false);
  };

  const chooseVideoDate = (value: string) => {
    if (!videoDraftFrom || videoDraftTo !== videoDraftFrom) {
      setVideoDraftFrom(value);
      setVideoDraftTo(value);
      return;
    }
    if (value < videoDraftFrom) {
      setVideoDraftFrom(value);
      setVideoDraftTo(videoDraftFrom);
    } else {
      setVideoDraftTo(value);
    }
    const nextFrom = value < videoDraftFrom ? value : videoDraftFrom;
    const nextTo = value < videoDraftFrom ? videoDraftFrom : value;
    setVideoFrom(nextFrom);
    setVideoTo(nextTo);
    setVideoDateOpen(false);
  };

  return (
    <main className="min-h-full bg-[#f5f7fa] text-slate-900">
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-500">
              <span>项目中心</span>
              <span className="text-slate-300">/</span>
              <span className="text-slate-700">AI漫剧</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-[#15171b] text-white shadow-sm">
                <Sparkles className="size-5" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-950">AI漫剧</h1>
                <p className="mt-1 text-xs text-slate-500">
                  多平台内容经营中心 · 抖音、快手、视频号已接入
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-600 shadow-sm">
              <Clock3 className="size-3.5 text-emerald-600" />
              <span>每小时更新</span>
              <span className="text-slate-300">·</span>
              <span>最近同步 {latestCollectedLabel}</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-500 shadow-sm">
              <CalendarDays className="size-3.5" />
              <span>{range.from}</span>
              <span>至</span>
              <span>{range.to}</span>
            </div>
          </div>
        </header>

        <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">平台总览</div>
              <div className="mt-1 text-xs text-slate-500">先看平台状态，再进入单平台经营数据</div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setPlatform("all")}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition ${
                  isAllPlatform
                    ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <span
                  className={`flex size-6 items-center justify-center rounded-md ${isAllPlatform ? "bg-white/15" : "bg-slate-100 text-slate-600"}`}
                >
                  <Globe2 className="size-3.5" />
                </span>
                <span>
                  <span className="block text-xs font-semibold">全平台</span>
                  <span
                    className={`block text-[10px] ${isAllPlatform ? "text-white/60" : "text-slate-400"}`}
                  >
                    已接入 3 / 5
                  </span>
                </span>
                {isAllPlatform ? <Check className="ml-1 size-3.5" /> : null}
              </button>
              {PLATFORMS.map((item) => {
                const active = platform === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setPlatform(item.key)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition ${
                      active
                        ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`flex size-6 items-center justify-center rounded-md ${active ? "bg-white/15" : `${item.soft} text-white`}`}
                    >
                      <item.Icon className="size-3.5" />
                    </span>
                    <span>
                      <span className="block text-xs font-semibold">{item.label}</span>
                      <span
                        className={`block text-[10px] ${active ? "text-white/60" : "text-slate-400"}`}
                      >
                        {item.status === "live" ? "已接入" : "待接入"}
                      </span>
                    </span>
                    {active ? <Check className="ml-1 size-3.5" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 border-b border-slate-100 sm:grid-cols-4 sm:divide-y-0">
            {PLATFORMS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setPlatform(item.key)}
                className={`group flex items-center gap-3 px-4 py-4 text-left transition sm:px-5 ${platform === item.key ? "bg-slate-50" : "bg-white hover:bg-slate-50/70"}`}
              >
                <span
                  className={`flex size-8 items-center justify-center rounded-lg ${item.soft} text-white`}
                >
                  <item.Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    {item.label}
                    <span
                      className={`size-1.5 rounded-full ${item.status === "live" ? "bg-emerald-500" : "bg-slate-300"}`}
                    />
                  </span>
                  <span className="mt-1 block truncate text-[11px] text-slate-400">
                    {item.note}
                  </span>
                </span>
                <span className="ml-auto shrink-0 text-right">
                  <span className="block text-[10px] text-slate-400">播放量</span>
                  <span className="mt-0.5 block text-sm font-semibold tabular-nums text-slate-800">
                    {item.status === "live" ? compact(platformPlayTotals[item.key]) : "--"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {!isAllPlatform && selectedPlatform.status === "planned" ? (
          <section className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-sm">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <Radio className="size-5" />
            </div>
            <h2 className="mt-4 text-base font-semibold text-slate-900">
              {selectedPlatform.label}数据待接入
            </h2>
            <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">
              当前先完成抖音数据链路。接入后，该平台会沿用同一套日期、指标和作品排行口径，方便横向比较。
            </p>
          </section>
        ) : (
          <>
            <section className="mt-5 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-4">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <CalendarDays className="size-4 text-slate-400" />
                <span className="font-medium text-slate-700">统计周期</span>
                <span className="hidden text-slate-300 sm:inline">|</span>
                <span>
                  {range.from} 至 {range.to}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    ["7", "近7天"],
                    ["30", "近30天"],
                    ["month", "本月"],
                    ["all", "全部"],
                    ["custom", "自定义"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => selectRange(key)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${rangeKey === key ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}
                  >
                    {label}
                  </button>
                ))}
                {rangeKey === "custom" ? (
                  <>
                    <input
                      aria-label="开始日期"
                      type="date"
                      value={range.from}
                      onChange={(event) =>
                        setRange((current) => ({ ...current, from: event.target.value }))
                      }
                      className="h-7 rounded-md border border-slate-200 px-2 text-xs text-slate-600"
                    />
                    <span className="text-xs text-slate-400">至</span>
                    <input
                      aria-label="结束日期"
                      type="date"
                      value={range.to}
                      onChange={(event) =>
                        setRange((current) => ({ ...current, to: event.target.value }))
                      }
                      className="h-7 rounded-md border border-slate-200 px-2 text-xs text-slate-600"
                    />
                  </>
                ) : null}
              </div>
            </section>

            <section className="mt-5 grid gap-4 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,2fr)]">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-slate-500">
                      {isAllPlatform ? "全平台 · 项目总览" : `${selectedPlatform.label} · 项目总览`}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      {isAllPlatform ? "全平台内容经营表现" : "内容经营表现"}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      所选期间发布作品的当前累计数据，不等同于后台按日新增数据
                    </div>
                  </div>
                  <div className="flex size-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                    <BarChart3 className="size-4" />
                  </div>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-5">
                  <Kpi label="作品累计播放" value={compact(totals.play)} icon={Play} />
                  <Kpi label="发布作品" value={compact(totals.publish)} icon={Film} />
                  <Kpi
                    label="累计互动"
                    value={compact(totals.like + totals.comment + totals.share)}
                    icon={Heart}
                  />
                  <Kpi label="作品涨粉" value={compact(totals.fans)} icon={Users} />
                </div>
                <div className="mt-6 border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">互动率</span>
                    <span className="font-semibold tabular-nums text-slate-900">
                      {interactionRate.toFixed(2)}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-slate-900"
                      style={{ width: `${Math.min(interactionRate * 10, 100)}%` }}
                    />
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400">点赞 + 评论 + 分享 / 播放</div>
                </div>
              </div>

              <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-xs font-medium text-slate-500">
                      {isAllPlatform ? "全平台作品表现" : `${selectedPlatform.label}作品表现`}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-slate-900">
                        后台日{selectedMetric.label}
                      </h2>
                      <span className="text-xs text-slate-400">
                        {range.from} 至 {range.to}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      账号按自然日新增数据，与平台后台数据详情口径一致
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 rounded-lg bg-slate-50 p-1">
                    {METRICS.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setMetric(item.key)}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${metric === item.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-4 h-[238px] min-w-0">
                  {loading ? (
                    <div className="flex h-full items-center justify-center rounded-lg bg-slate-50 text-xs text-slate-400">
                      数据加载中
                    </div>
                  ) : error ? (
                    <div className="flex h-full items-center justify-center rounded-lg bg-rose-50 text-xs text-rose-600">
                      读取失败：{error}
                    </div>
                  ) : chartData.length < 2 ? (
                    <div className="flex h-full items-center justify-center rounded-lg bg-slate-50 text-xs text-slate-400">
                      暂无趋势数据
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={chartData}
                        margin={{ top: 8, right: 10, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="ai-comic-area" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={selectedMetric.color} stopOpacity={0.18} />
                            <stop
                              offset="100%"
                              stopColor={selectedMetric.color}
                              stopOpacity={0.01}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 5" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10, fill: "#94a3b8" }}
                          tickLine={false}
                          axisLine={false}
                          minTickGap={20}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#94a3b8" }}
                          tickLine={false}
                          axisLine={false}
                          width={42}
                          tickFormatter={compact}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: 8,
                            border: "1px solid #e2e8f0",
                            fontSize: 12,
                            boxShadow: "0 8px 24px rgba(15,23,42,.08)",
                          }}
                          labelStyle={{ color: "#0f172a", fontWeight: 600, marginBottom: 4 }}
                          formatter={(value) => [
                            typeof value === "number" ? value.toLocaleString("zh-CN") : "--",
                            selectedMetric.label,
                          ]}
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke={selectedMetric.color}
                          strokeWidth={2.5}
                          fill="url(#ai-comic-area)"
                          dot={false}
                          activeDot={{ r: 4 }}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </section>

            <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">作品表现</h2>
                  <p className="mt-1 text-xs text-slate-500">每页展示 5 个作品，点击进入作品详情</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setVideoDateOpen((open) => !open)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition ${videoDateOpen ? "border-blue-500 bg-blue-50 text-slate-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                    >
                      <CalendarDays className="size-3.5 text-slate-400" />
                      <span className="whitespace-nowrap">发布日期</span>
                      <span className="hidden text-slate-400 xl:inline">
                        {displayDateRange(videoFrom, videoTo)}
                      </span>
                      <ChevronRight
                        className={`size-3.5 rotate-90 text-slate-400 transition ${videoDateOpen ? "-rotate-90" : ""}`}
                      />
                    </button>
                    {videoDateOpen ? (
                      <div className="absolute right-0 z-30 mt-2 flex w-[760px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                        <div className="w-[190px] shrink-0 border-r border-slate-200 p-4">
                          <div className="mb-3 text-sm font-semibold text-slate-800">快捷选择</div>
                          <div className="grid grid-cols-2 gap-2">
                            {(
                              [
                                ["today", "当天"],
                                ["week", "前1周"],
                                ["month", "前1个月"],
                                ["twoMonths", "前2个月"],
                                ["all", "全部"],
                              ] as const
                            ).map(([key, label]) => (
                              <button
                                key={key}
                                type="button"
                                onClick={() => chooseVideoShortcut(key)}
                                className="rounded-lg bg-slate-100 px-2 py-2 text-xs font-medium text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1 p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <button
                              type="button"
                              aria-label="上个月"
                              onClick={() => setCalendarMonth((month) => shiftMonth(month, -1))}
                              className="flex size-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                            >
                              <ChevronLeft className="size-4" />
                            </button>
                            <div className="grid flex-1 grid-cols-2 text-center text-sm font-semibold text-slate-800">
                              <span>{monthLabel(calendarMonth)}</span>
                              <span>{monthLabel(shiftMonth(calendarMonth, 1))}</span>
                            </div>
                            <button
                              type="button"
                              aria-label="下个月"
                              onClick={() => setCalendarMonth((month) => shiftMonth(month, 1))}
                              className="flex size-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                            >
                              <ChevronRight className="size-4" />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-5">
                            {[calendarMonth, shiftMonth(calendarMonth, 1)].map((month) => (
                              <div key={month.toISOString()}>
                                <div className="mb-2 grid grid-cols-7 text-center text-[11px] text-slate-400">
                                  {"日一二三四五六".split("").map((day) => (
                                    <span key={day}>{day}</span>
                                  ))}
                                </div>
                                <div className="grid grid-cols-7 gap-y-1 text-center">
                                  {calendarCells(month).map((day, index) => {
                                    if (!day)
                                      return <span key={`empty-${index}`} className="h-7" />;
                                    const value = dateKey(day);
                                    const active = value >= videoDraftFrom && value <= videoDraftTo;
                                    const edge = value === videoDraftFrom || value === videoDraftTo;
                                    return (
                                      <button
                                        key={value}
                                        type="button"
                                        onClick={() => chooseVideoDate(value)}
                                        className={`mx-auto flex size-7 items-center justify-center rounded-md text-xs transition ${edge ? "bg-blue-600 font-semibold text-white" : active ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-100"}`}
                                      >
                                        {day.getUTCDate()}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <label className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-500">
                    <ListFilter className="size-3.5 text-slate-400" />
                    <span className="sr-only">作品排序</span>
                    <select
                      aria-label="作品排序"
                      value={videoSort}
                      onChange={(event) => setVideoSort(event.target.value as VideoSortKey)}
                      className="bg-transparent text-xs font-medium text-slate-700 outline-none"
                    >
                      <option value="published">最新发布</option>
                      <option value="views">最高播放</option>
                      <option value="likes">最高点赞</option>
                    </select>
                  </label>
                  <span className="text-xs text-slate-400">共 {sortedVideos.length} 条</span>
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {pageVideos.map((video, index) => (
                  <Link
                    key={video.item_id}
                    href={`/projects/ai-comic/${video.platform ?? (platform === "all" ? "douyin" : platform)}/${video.item_id}`}
                    className="group flex gap-4 px-5 py-4 transition hover:bg-slate-50 sm:px-6"
                  >
                    <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100 shadow-sm sm:h-32 sm:w-[92px]">
                      {video.cover_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={video.cover_url} alt="" className="size-full object-cover" />
                      ) : (
                        <Film className="m-7 size-6 text-slate-300" />
                      )}
                      <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                        #{(page - 1) * 5 + index + 1}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-slate-900 group-hover:text-slate-600">
                          {video.description || "未命名作品"}
                        </h3>
                        <ChevronRight className="mt-0.5 size-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-700" />
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                        <span>
                          {new Date(video.publish_time).toLocaleString("zh-CN", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
                        </span>
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-600">
                          已发布
                        </span>
                        <span>
                          {video.avg_view_second
                            ? `${Number(video.avg_view_second).toFixed(0)}秒均看`
                            : "暂无均看"}
                        </span>
                      </div>
                      <div className="mt-5 grid grid-cols-3 gap-x-5 gap-y-3 text-xs sm:grid-cols-6 lg:grid-cols-9">
                        <VideoMetric label="播放" value={compact(video.view_count)} strong />
                        <VideoMetric label="点赞" value={compact(video.like_count)} />
                        <VideoMetric label="评论" value={compact(video.comment_count)} />
                        <VideoMetric label="分享" value={compact(video.share_count)} />
                        <VideoMetric label="收藏" value={compact(video.favorite_count)} />
                        <VideoMetric label="弹幕" value={compact(video.danmaku_count)} />
                        <VideoMetric label="完播率" value={percentage(video.completion_rate)} />
                        <VideoMetric label="5秒留存" value={percentage(video.completion_rate_5s)} />
                        <VideoMetric label="吸粉量" value={compact(video.subscribe_count)} />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              {!loading && !error && sortedVideos.length === 0 ? (
                <div className="px-5 py-12 text-center text-xs text-slate-400">
                  当前周期暂无发布作品
                </div>
              ) : null}
              {sortedVideos.length > 0 ? (
                <div className="flex items-center justify-center gap-3 border-t border-slate-100 px-5 py-3">
                  <button
                    type="button"
                    aria-label="上一页"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="flex size-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="text-xs tabular-nums text-slate-500">
                    第 {page} / {pageCount} 页
                  </span>
                  <button
                    type="button"
                    aria-label="下一页"
                    disabled={page >= pageCount}
                    onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                    className="flex size-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              ) : null}
            </section>

            <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                数据来源：{isAllPlatform ? "已接入平台" : selectedPlatform.label}
              </span>
              <span className="inline-flex items-center gap-1.5">
                支持后续接入视频号、小红书、B站 <ExternalLink className="size-3" />
              </span>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Play;
}): React.JSX.Element {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="mt-1.5 text-xl font-semibold tracking-tight text-slate-950">{value}</div>
    </div>
  );
}

function VideoMetric({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}): React.JSX.Element {
  return (
    <div className="min-w-0">
      <div className="truncate text-[10px] text-slate-400">{label}</div>
      <div
        className={`mt-0.5 truncate tabular-nums ${strong ? "font-semibold text-slate-900" : "text-slate-700"}`}
      >
        {value}
      </div>
    </div>
  );
}
