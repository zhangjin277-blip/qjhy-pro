"use client";
import { DateRangePicker } from "@/components/patterns/date-range-picker";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  BookOpen,
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
type AccountKey = "sun-xiaosheng" | "xiao-mowan";
type PlatformConnectionStatus = "active" | "expired" | "missing" | "unknown";

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
  platform?: "douyin" | "kuaishou" | "wechat" | "bilibili" | "xiaohongshu";
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

interface AccountDefinition {
  key: AccountKey;
  label: string;
  note: string;
  platforms: PlatformKey[];
  ready: boolean;
}

const ACCOUNTS: AccountDefinition[] = [
  {
    key: "sun-xiaosheng",
    label: "造化仙府-孙小圣",
    note: "抖音、快手、小红书、B站、视频号",
    platforms: ["douyin", "kuaishou", "xiaohongshu", "bilibili", "wechat"],
    ready: true,
  },
  {
    key: "xiao-mowan",
    label: "造化仙府-小魔丸",
    note: "仅接入抖音",
    platforms: ["douyin"],
    ready: true,
  },
];
const DEFAULT_ACCOUNT = ACCOUNTS[0] as AccountDefinition;

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
    note: "创作服务平台",
    status: "live",
    Icon: BookOpen,
    accent: "text-rose-700",
    soft: "bg-rose-500",
  },
  {
    key: "bilibili",
    label: "B站",
    note: "创作中心",
    status: "live",
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

const VIDEO_PLATFORM_BADGES: Record<
  NonNullable<Video["platform"]>,
  { label: string; Icon: typeof Music2; className: string }
> = {
  douyin: {
    label: "抖音",
    Icon: Music2,
    className: "bg-slate-800 text-white",
  },
  kuaishou: {
    label: "快手",
    Icon: Clapperboard,
    className: "bg-orange-50 text-orange-700",
  },
  wechat: {
    label: "视频号",
    Icon: MessageCircle,
    className: "bg-emerald-50 text-emerald-700",
  },
  bilibili: {
    label: "B站",
    Icon: Tv2,
    className: "bg-cyan-50 text-cyan-700",
  },
  xiaohongshu: {
    label: "小红书",
    Icon: BookOpen,
    className: "bg-rose-50 text-rose-700",
  },
};

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

export function AiComicProject(): React.JSX.Element {
  const [account, setAccount] = useState<AccountKey>("sun-xiaosheng");
  const [platform, setPlatform] = useState<ViewKey>("all");
  const [range, setRange] = useState(() => rangeFor("all"));
  const [metric, setMetric] = useState<MetricKey>("play");
  const [videoSort, setVideoSort] = useState<VideoSortKey>("published");
  const [videoFrom, setVideoFrom] = useState(() => rangeFor("all").from);
  const [videoTo, setVideoTo] = useState(() => rangeFor("all").to);
  const [page, setPage] = useState(1);
  const [daily, setDaily] = useState<Daily[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platformStatuses, setPlatformStatuses] = useState<
    Partial<Record<PlatformKey, PlatformConnectionStatus>>
  >({});
  const selectedAccount = ACCOUNTS.find((item) => item.key === account) ?? DEFAULT_ACCOUNT;
  const connectedPlatformCount = selectedAccount.platforms.filter(
    (item) => platformStatuses[item] === "active",
  ).length;
  const platformStatusesReady = selectedAccount.platforms.every(
    (item) => platformStatuses[item] !== undefined,
  );
  const accountHasData = selectedAccount.ready;

  useEffect(() => {
    let active = true;
    const loadStatuses = async () => {
      try {
        const response = await fetch(`/api/projects/ai-comic/status?account=${account}`, {
          cache: "no-store",
        });
        const body = (await response.json()) as {
          statuses?: Partial<Record<PlatformKey, PlatformConnectionStatus>>;
        };
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (active) setPlatformStatuses(body.statuses ?? {});
      } catch {
        if (active) {
          setPlatformStatuses(
            Object.fromEntries(selectedAccount.platforms.map((item) => [item, "unknown"])),
          );
        }
      }
    };

    setPlatformStatuses({});
    void loadStatuses();
    const timer = window.setInterval(() => void loadStatuses(), 86_400_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [account, selectedAccount.platforms]);

  useEffect(() => {
    if (!accountHasData) {
      setLoading(false);
      setError(null);
      setDaily([]);
      setVideos([]);
      return;
    }
    if (!["douyin", "kuaishou", "wechat", "bilibili", "xiaohongshu", "all"].includes(platform))
      return;
    setLoading(true);
    setError(null);
    const endpoints = selectedAccount.platforms.filter(
      (item): item is "douyin" | "kuaishou" | "wechat" | "bilibili" | "xiaohongshu" =>
        item === "douyin" ||
        item === "kuaishou" ||
        item === "wechat" ||
        item === "bilibili" ||
        item === "xiaohongshu",
    );
    void Promise.all(
      endpoints.map(async (endpoint) => {
        const response = await fetch(
          `/api/projects/ai-comic/${endpoint}?from=${range.from}&to=${range.to}&account=${account}`,
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
  }, [account, accountHasData, platform, range.from, range.to, selectedAccount.platforms]);

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
  const platformPlayTotals = useMemo(
    () =>
      PLATFORMS.map((definition) => ({
        ...definition,
        play: videos.reduce(
          (sum, video) => (video.platform === definition.key ? sum + (video.view_count ?? 0) : sum),
          0,
        ),
      })),
    [videos],
  );
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
  const syncFrequencyLabel =
    platform === "bilibili" || platform === "xiaohongshu"
      ? "每天10:00更新"
      : platform === "all"
        ? "定时更新"
        : "每小时更新";
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

  return (
    <main className="min-h-full bg-[#f5f7fa] text-slate-900">
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-500">
              <span>造化仙府</span>
              <span className="text-slate-300">/</span>
              <span className="text-slate-700">造化视频</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-[#15171b] text-white shadow-sm">
                <Sparkles className="size-5" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-950">造化视频</h1>
                <p className="mt-1 text-xs text-slate-500">
                  多平台内容经营中心 · 抖音、快手、小红书、B站、视频号已接入
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-600 shadow-sm">
              <Clock3 className="size-3.5 text-emerald-600" />
              <span>{syncFrequencyLabel}</span>
              <span className="text-slate-300">·</span>
              <span>最近同步 {latestCollectedLabel}</span>
            </div>
            <DateRangePicker
              label="发布日期"
              value={{ from: videoFrom, to: videoTo }}
              onChange={(next) => {
                setRange(next);
                setVideoFrom(next.from);
                setVideoTo(next.to);
              }}
              onAll={() => {
                const next = rangeFor("all");
                setRange(next);
                setVideoFrom(next.from);
                setVideoTo(next.to);
              }}
              presets={[
                { label: "当天", value: { from: beijingDate(), to: beijingDate() } },
                { label: "前1周", value: rangeFor("7") },
                { label: "前1个月", value: rangeFor("month") },
                { label: "前2个月", value: { from: dateOffset(-59), to: beijingDate() } },
              ]}
            />
          </div>
        </header>

        <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
            <span className="text-xs font-semibold text-slate-700">账号</span>
            <div className="flex flex-wrap gap-1.5">
              {ACCOUNTS.map((item) => {
                const active = account === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setAccount(item.key);
                      setPlatform(item.key === "xiao-mowan" ? "douyin" : "all");
                    }}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition ${active ? "border-slate-900 bg-slate-900 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"}`}
                  >
                    <span>
                      <span className="block text-xs font-semibold">{item.label}</span>
                      <span
                        className={`block text-[10px] ${active ? "text-white/60" : "text-slate-400"}`}
                      >
                        {item.note}
                      </span>
                    </span>
                    {active ? <Check className="size-3.5" /> : null}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1.5 lg:ml-auto">
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
                    {!platformStatusesReady
                      ? "检测渠道状态"
                      : connectedPlatformCount === selectedAccount.platforms.length
                        ? `已接入 ${connectedPlatformCount} / 5 个渠道`
                        : `有效 ${connectedPlatformCount} / ${selectedAccount.platforms.length} 个渠道`}
                  </span>
                </span>
                {isAllPlatform ? <Check className="ml-1 size-3.5" /> : null}
              </button>
              {PLATFORMS.map((item) => {
                const active = platform === item.key;
                const configured = selectedAccount.platforms.includes(item.key);
                const connectionStatus = platformStatuses[item.key];
                const statusLabel = !configured
                  ? "未接入"
                  : connectionStatus === "active"
                    ? "已接入"
                    : connectionStatus === "expired"
                      ? "已失效"
                      : connectionStatus === "missing"
                        ? "待授权"
                        : connectionStatus === "unknown"
                          ? "状态未知"
                          : "检测中";
                const statusClass =
                  connectionStatus === "expired"
                    ? active
                      ? "text-red-300"
                      : "text-red-600"
                    : active
                      ? "text-white/60"
                      : "text-slate-400";
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => configured && setPlatform(item.key)}
                    disabled={!configured}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition ${
                      active
                        ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                        : configured
                          ? "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                          : "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400"
                    }`}
                  >
                    <span
                      className={`flex size-6 items-center justify-center rounded-md ${active ? "bg-white/15" : `${item.soft} text-white`}`}
                    >
                      <item.Icon className="size-3.5" />
                    </span>
                    <span>
                      <span className="block text-xs font-semibold">{item.label}</span>
                      <span className={`block text-[10px] ${statusClass}`}>{statusLabel}</span>
                    </span>
                    {active ? <Check className="ml-1 size-3.5" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {!accountHasData ? (
          <section className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-sm">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <Clock3 className="size-5" />
            </div>
            <h2 className="mt-4 text-base font-semibold text-slate-900">等待抖音账号授权</h2>
            <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">
              {selectedAccount.label}
              已建立账号分类，目前只接入抖音。完成抖音创作者中心授权后，系统才会开始拉取该账号数据。
            </p>
          </section>
        ) : !isAllPlatform && selectedPlatform.status === "planned" ? (
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
                {isAllPlatform ? (
                  <div className="mt-6 border-t border-slate-100 pt-4">
                    <div className="mb-3 text-[11px] font-medium text-slate-500">各平台播放量</div>
                    <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                      {platformPlayTotals.map((item) => (
                        <div
                          key={item.key}
                          className="flex min-w-0 items-center justify-between gap-2"
                        >
                          <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-500">
                            <span
                              className={`flex size-5 shrink-0 items-center justify-center rounded ${item.soft} text-white`}
                            >
                              <item.Icon className="size-3" />
                            </span>
                            <span className="truncate">{item.label}</span>
                          </span>
                          <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-800">
                            {compact(item.play)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
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
                {pageVideos.map((video, index) => {
                  const platformBadge = video.platform
                    ? VIDEO_PLATFORM_BADGES[video.platform]
                    : null;
                  const PlatformIcon = platformBadge?.Icon;

                  return (
                    <Link
                      key={video.item_id}
                      href={`/projects/ai-comic/${video.platform ?? (platform === "all" ? "douyin" : platform)}/${video.item_id}?account=${account}`}
                      className="group flex gap-4 px-5 py-4 transition hover:bg-slate-50 sm:px-6"
                    >
                      <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100 shadow-sm sm:h-32 sm:w-[92px]">
                        {video.cover_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={video.cover_url}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="size-full object-cover"
                          />
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
                          {isAllPlatform && platformBadge && PlatformIcon ? (
                            <span
                              className={`inline-flex h-5 items-center gap-1 rounded-md px-1.5 font-medium ${platformBadge.className}`}
                            >
                              <PlatformIcon className="size-3" />
                              {platformBadge.label}
                            </span>
                          ) : null}
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
                          <VideoMetric
                            label="5秒留存"
                            value={percentage(video.completion_rate_5s)}
                          />
                          <VideoMetric label="吸粉量" value={compact(video.subscribe_count)} />
                        </div>
                      </div>
                    </Link>
                  );
                })}
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
                5 个平台数据统一展示 <ExternalLink className="size-3" />
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
