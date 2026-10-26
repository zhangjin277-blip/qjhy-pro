"use client";
import { DateRangePicker } from "@/components/patterns/date-range-picker";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  CalendarRange,
  Clock3,
  Gamepad2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

type DataView = "overview" | "traffic" | "game";
type DataScope = "session" | "period";
type PeriodPreset = "last7" | "last30" | "custom";

interface OfficialReplay {
  roomId: string;
  account: string;
  title: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  exposureUv: number | null;
  enterRoomUv: number | null;
  enterRoomRate: number | null;
  avgOnline: number | null;
  peakOnline: number | null;
  avgWatchSeconds: number | null;
  soundWave: number | null;
  giftUsers: number | null;
  newFollowers: number | null;
  commentUsers: number | null;
  likeCount: number | null;
  shareCount: number | null;
  fanClubUsers: number | null;
  gameRevenue: number | null;
  gameActivations: number | null;
  gamePurchases: number | null;
  syncedAt: string;
}

const VIEWS: { key: DataView; label: string }[] = [
  { key: "overview", label: "场次概览" },
  { key: "traffic", label: "流量分析" },
  { key: "game", label: "小游戏转化" },
];

const SAMPLE: OfficialReplay = {
  roomId: "7675279938676935465",
  account: "造化仙府丨孙小圣",
  title: "仙尊，大事不好啦！",
  startedAt: "2026-08-18T16:06:00+08:00",
  endedAt: "2026-08-19T00:01:00+08:00",
  durationSeconds: 28_500,
  exposureUv: 1_077_000,
  enterRoomUv: 28_000,
  enterRoomRate: 2.6,
  avgOnline: 32,
  peakOnline: 90,
  avgWatchSeconds: 24,
  soundWave: 38,
  giftUsers: 18,
  newFollowers: 61,
  commentUsers: 167,
  likeCount: 51_000,
  shareCount: 12,
  fanClubUsers: 4,
  gameRevenue: 1,
  gameActivations: 119,
  gamePurchases: null,
  syncedAt: "2026-08-19T00:05:00+08:00",
};

const CHANNELS = [
  { name: "个人主页", audience: 36.9, duration: "0.2分钟", revenue: 8.6 },
  { name: "视频推荐", audience: 35.5, duration: "0.2分钟", revenue: 0 },
  { name: "搜索", audience: 8.5, duration: "0.2分钟", revenue: 5.7 },
  { name: "其他", audience: 6.5, duration: "0.4分钟", revenue: 0 },
  { name: "关注页", audience: 5.8, duration: "0.4分钟", revenue: 11.4 },
  { name: "更多", audience: 6.8, duration: "0.0分钟", revenue: 74.3 },
];

const TOP_VIDEOS = [
  { title: "就哥儿几个没正经班上喽", exposure: "46.37万", entries: "1.03万", rate: "2.21%" },
  { title: "合集1-5来了", exposure: "13.17万", entries: "2,168", rate: "1.65%" },
  { title: "华尔街之狼说是", exposure: "10.62万", entries: "1,474", rate: "1.39%" },
];

function cstDate(date: Date): string {
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00+08:00`);
  value.setDate(value.getDate() + days);
  return cstDate(value);
}

function formatDateTime(value: string | null): string {
  if (!value) return "--";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  });
}

function duration(seconds: number | null): string {
  if (seconds == null) return "--";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return `${hours > 0 ? `${hours}小时` : ""}${minutes}分钟`;
}

function compact(value: number | null, digits = 1): string {
  if (value == null) return "--";
  if (Math.abs(value) >= 10_000) return `${(value / 10_000).toFixed(digits)}万`;
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(value);
}

function mean(rows: OfficialReplay[], key: keyof OfficialReplay): number | null {
  const values = rows
    .map((row) => row[key])
    .filter((value): value is number => typeof value === "number");
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function sum(rows: OfficialReplay[], key: keyof OfficialReplay): number | null {
  const values = rows
    .map((row) => row[key])
    .filter((value): value is number => typeof value === "number");
  return values.length > 0 ? values.reduce((total, value) => total + value, 0) : null;
}

function aggregate(rows: OfficialReplay[]): OfficialReplay {
  const first = rows[0];
  if (!first) return SAMPLE;
  const exposureUv = sum(rows, "exposureUv");
  const enterRoomUv = sum(rows, "enterRoomUv");
  return {
    ...first,
    roomId: "period",
    title: `${rows.length} 场汇总`,
    durationSeconds: sum(rows, "durationSeconds"),
    exposureUv,
    enterRoomUv,
    enterRoomRate:
      exposureUv && enterRoomUv != null
        ? Number(((enterRoomUv / exposureUv) * 100).toFixed(2))
        : null,
    avgOnline: mean(rows, "avgOnline"),
    peakOnline: Math.max(...rows.map((row) => row.peakOnline ?? 0)),
    avgWatchSeconds: mean(rows, "avgWatchSeconds"),
    soundWave: sum(rows, "soundWave"),
    giftUsers: sum(rows, "giftUsers"),
    newFollowers: sum(rows, "newFollowers"),
    commentUsers: sum(rows, "commentUsers"),
    likeCount: sum(rows, "likeCount"),
    shareCount: sum(rows, "shareCount"),
    fanClubUsers: sum(rows, "fanClubUsers"),
    gameRevenue: sum(rows, "gameRevenue"),
    gameActivations: sum(rows, "gameActivations"),
    gamePurchases: sum(rows, "gamePurchases"),
  };
}

export function OfficialDataPanel({ teamSummary }: { teamSummary: string }): React.JSX.Element {
  const today = cstDate(new Date());
  const [view, setView] = useState<DataView>("overview");
  const [scope, setScope] = useState<DataScope>("session");
  const [period, setPeriod] = useState<PeriodPreset>("last7");
  const [dateFrom, setDateFrom] = useState(shiftDate(today, -6));
  const [dateTo, setDateTo] = useState(today);
  const [rows, setRows] = useState<OfficialReplay[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/projects/zhaohua/official-replays", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as { rows: OfficialReplay[] };
      })
      .then((data) => {
        if (cancelled) return;
        setRows(data.rows);
        setSelectedId(data.rows[0]?.roomId ?? SAMPLE.roomId);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError((error as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (period === "custom") return;
    setDateTo(today);
    setDateFrom(shiftDate(today, period === "last7" ? -6 : -29));
  }, [period, today]);

  const isSample = rows.length === 0;
  const availableRows = useMemo(() => (isSample ? [SAMPLE] : rows), [isSample, rows]);
  const selected =
    availableRows.find((row) => row.roomId === selectedId) ?? availableRows[0] ?? SAMPLE;
  const periodRows = useMemo(
    () =>
      availableRows.filter((row) => {
        const date = cstDate(new Date(row.startedAt));
        return date >= dateFrom && date <= dateTo;
      }),
    [availableRows, dateFrom, dateTo],
  );
  const display = scope === "period" && periodRows.length > 0 ? aggregate(periodRows) : selected;

  return (
    <section className="overflow-hidden border-y border-slate-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-slate-200 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="truncate text-sm font-semibold text-slate-900">{selected.account}</h3>
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
            抖音灵机
          </span>
          {isSample ? <span className="text-[10px] text-amber-600">示例数据</span> : null}
          <span className="hidden h-4 w-px bg-slate-200 sm:block" />
          <span className="text-xs text-slate-500">{teamSummary}</span>
        </div>
        <p className="text-[11px] text-slate-400">
          {loading
            ? "数据加载中"
            : loadError
              ? `读取失败 ${loadError}`
              : `${formatDateTime(selected.startedAt)} · ${duration(selected.durationSeconds)}`}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            ["session", "单场数据"],
            ["period", "周期汇总"],
          ]}
        />
        {scope === "session" ? (
          <label className="relative min-w-0 flex-1 sm:max-w-[480px]">
            <span className="sr-only">选择直播场次</span>
            <select
              value={selected.roomId}
              onChange={(event) => setSelectedId(event.target.value)}
              className="h-8 w-full appearance-none rounded-md border border-slate-200 bg-white px-3 pr-12 text-xs font-medium text-slate-700 outline-none focus:border-primary/40"
            >
              {availableRows.map((row) => (
                <option key={row.roomId} value={row.roomId}>
                  {formatDateTime(row.startedAt)} · {duration(row.durationSeconds)} ·{" "}
                  {row.title ?? "未命名场次"}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-400">
              {availableRows.length} 场
            </span>
          </label>
        ) : (
          <>
            <Segmented
              value={period}
              onChange={setPeriod}
              options={[
                ["last7", "近7天"],
                ["last30", "近30天"],
                ["custom", "自定义"],
              ]}
              compact
            />
            {period === "custom" ? (
              <div className="flex min-w-0 items-center gap-1.5">
                <CalendarRange className="size-3.5 shrink-0 text-slate-400" />
                <DateRangePicker
                  label="直播日期"
                  value={{ from: dateFrom, to: dateTo }}
                  onChange={(next) => {
                    setDateFrom(next.from);
                    setDateTo(next.to);
                  }}
                />
              </div>
            ) : null}
            <span className="ml-auto text-[11px] text-slate-400">当前 {periodRows.length} 场</span>
          </>
        )}
      </div>

      <div className="flex min-w-max gap-1 border-b border-slate-100 px-3" role="tablist">
        {VIEWS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={view === item.key}
            onClick={() => setView(item.key)}
            className={cn(
              "relative h-10 px-3 text-xs font-medium",
              view === item.key ? "text-primary" : "text-slate-500 hover:text-slate-800",
            )}
          >
            {item.label}
            {view === item.key ? (
              <span className="absolute inset-x-2 bottom-0 h-0.5 bg-primary" />
            ) : null}
          </button>
        ))}
      </div>

      {view === "overview" ? (
        <OverviewView replay={display} scope={scope} count={periodRows.length} />
      ) : null}
      {view === "traffic" ? <TrafficView available={selected.roomId === SAMPLE.roomId} /> : null}
      {view === "game" ? <GameView replay={display} /> : null}
    </section>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
  compact = false,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly (readonly [T, string])[];
  compact?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex rounded-md border border-slate-200 bg-white p-0.5" role="group">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            "h-7 rounded font-medium transition",
            compact ? "px-2 text-[11px]" : "px-2.5 text-xs",
            value === key ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function OverviewView({
  replay,
  scope,
  count,
}: {
  replay: OfficialReplay;
  scope: DataScope;
  count: number;
}): React.JSX.Element {
  const metrics = [
    ["曝光人数", compact(replay.exposureUv), "直播间曝光"],
    ["进房人数", compact(replay.enterRoomUv), "进入直播间"],
    [
      "进房率",
      replay.enterRoomRate == null ? "--" : `${replay.enterRoomRate.toFixed(1)}%`,
      "曝光至进房",
    ],
    ["平均在线", compact(replay.avgOnline), `最高在线 ${compact(replay.peakOnline)}`],
    [
      "人均停留",
      replay.avgWatchSeconds == null ? "--" : `${(replay.avgWatchSeconds / 60).toFixed(1)}分钟`,
      "平均观看时长",
    ],
    ["收获音浪", compact(replay.soundWave), `${compact(replay.giftUsers)} 人送礼`],
    ["新增粉丝", compact(replay.newFollowers), `加粉丝团 ${compact(replay.fanClubUsers)} 人`],
    [
      "评论人数",
      compact(replay.commentUsers),
      `点赞 ${compact(replay.likeCount)} · 分享 ${compact(replay.shareCount)}`,
    ],
  ];
  return (
    <div>
      <div className="grid border-b border-slate-100 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(([label, value, note]) => (
          <div
            key={label}
            className="border-b border-r border-slate-100 px-4 py-3 last:border-r-0 lg:[&:nth-last-child(-n+4)]:border-b-0"
          >
            <p className="text-[11px] text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-semibold tracking-normal text-slate-900">{value}</p>
            <p className="mt-0.5 truncate text-[10px] text-slate-400">
              {scope === "period" ? `${count} 场 · ${note}` : note}
            </p>
          </div>
        ))}
      </div>
      <div className="grid divide-y divide-slate-100 md:grid-cols-3 md:divide-x md:divide-y-0">
        <SummaryLine
          icon={Clock3}
          label={scope === "period" ? "累计直播" : "直播时间"}
          value={
            scope === "period"
              ? duration(replay.durationSeconds)
              : `${formatDateTime(replay.startedAt)} - ${formatDateTime(replay.endedAt)}`
          }
        />
        <SummaryLine
          icon={Users}
          label="互动人数"
          value={`${compact(replay.commentUsers)} 人评论 · ${compact(replay.shareCount)} 次分享`}
        />
        <SummaryLine
          icon={Activity}
          label="付费转化"
          value={`${compact(replay.giftUsers)} 人送礼 · ${compact(replay.soundWave)} 音浪`}
        />
      </div>
    </div>
  );
}

function TrafficView({ available }: { available: boolean }): React.JSX.Element {
  if (!available)
    return <EmptyState text="当前采集接口暂未返回场次流量渠道明细；基础复盘数据已正常保存。" />;
  return (
    <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:divide-x lg:divide-slate-200">
      <div className="min-w-0 px-4 py-4">
        <h4 className="text-xs font-semibold text-slate-800">流量渠道来源</h4>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="text-[10px] text-slate-400">
              <tr className="border-b border-slate-100">
                <th className="pb-2 font-medium">渠道</th>
                <th className="pb-2 font-medium">观众占比</th>
                <th className="pb-2 font-medium">人均观看</th>
                <th className="pb-2 text-right font-medium">营收占比</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {CHANNELS.map((channel) => (
                <tr key={channel.name}>
                  <td className="py-2.5 font-medium text-slate-700">{channel.name}</td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-11 tabular-nums text-slate-700">{channel.audience}%</span>
                      <span className="h-1.5 w-20 overflow-hidden bg-slate-100">
                        <span
                          className="block h-full bg-blue-500"
                          style={{ width: `${channel.audience}%` }}
                        />
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 text-slate-500">{channel.duration}</td>
                  <td className="py-2.5 text-right tabular-nums text-slate-700">
                    {channel.revenue}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="min-w-0 px-4 py-4">
        <h4 className="text-xs font-semibold text-slate-800">短视频引流 TOP 3</h4>
        <div className="mt-3 divide-y divide-slate-100">
          {TOP_VIDEOS.map((video, index) => (
            <div
              key={video.title}
              className="grid grid-cols-[24px_minmax(0,1fr)] gap-2 py-3 first:pt-0"
            >
              <span className="flex size-5 items-center justify-center rounded bg-slate-100 text-[10px] font-semibold text-slate-500">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-700">{video.title}</p>
                <div className="mt-1.5 grid grid-cols-3 gap-2 text-[10px] text-slate-400">
                  <span>
                    曝光 <b className="font-medium text-slate-600">{video.exposure}</b>
                  </span>
                  <span>
                    进房 <b className="font-medium text-slate-600">{video.entries}</b>
                  </span>
                  <span>
                    转化 <b className="font-medium text-slate-600">{video.rate}</b>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GameView({ replay }: { replay: OfficialReplay }): React.JSX.Element {
  return (
    <div className="grid md:grid-cols-2 md:divide-x md:divide-slate-200">
      <GameFunnel
        title="小游戏观众转化"
        values={[
          ["进房人数", compact(replay.enterRoomUv)],
          ["激活人数", compact(replay.gameActivations)],
          ["内购人数", compact(replay.gamePurchases)],
        ]}
        footer="按当前场次灵机复盘口径"
      />
      <div className="grid grid-cols-3 divide-x divide-slate-100">
        <MiniMetric
          label="预估收入"
          value={replay.gameRevenue == null ? "--" : `${compact(replay.gameRevenue)}元`}
        />
        <MiniMetric label="激活人数" value={compact(replay.gameActivations)} />
        <MiniMetric label="内购人数" value={compact(replay.gamePurchases)} />
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }): React.JSX.Element {
  return <div className="px-4 py-12 text-center text-xs text-slate-400">{text}</div>;
}
function SummaryLine({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className="size-4 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <p className="text-[10px] text-slate-400">{label}</p>
        <p className="truncate text-xs font-medium text-slate-700">{value}</p>
      </div>
    </div>
  );
}
function GameFunnel({
  title,
  values,
  footer,
}: {
  title: string;
  values: [string, string][];
  footer: string;
}): React.JSX.Element {
  return (
    <div className="px-4 py-4">
      <div className="flex items-center gap-2">
        <Gamepad2 className="size-4 text-slate-400" />
        <h4 className="text-xs font-semibold text-slate-800">{title}</h4>
      </div>
      <div className="mt-4 flex items-center gap-2 overflow-x-auto">
        {values.map(([label, value], index) => (
          <div key={label} className="contents">
            {index > 0 ? <ArrowRight className="size-3.5 shrink-0 text-slate-300" /> : null}
            <div className="min-w-20 flex-1 border-l-2 border-blue-400 bg-slate-50 px-2.5 py-2">
              <p className="text-[10px] text-slate-400">{label}</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-800">{value}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1 text-[10px] text-slate-500">
        <ArrowDownRight className="size-3" />
        {footer}
      </p>
    </div>
  );
}
function MiniMetric({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="px-3 py-6 text-center">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
