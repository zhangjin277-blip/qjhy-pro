"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { KpiGrid, type KpiItem } from "@/components/patterns/kpi-grid";
import { PresetChip, PresetToolbar } from "@/components/patterns/preset-toolbar";
import { cn } from "@/lib/utils/cn";

// ─── 列定义 + 自定义勾选 ──────────────────────────────────────────
type ColKey =
  // 基础
  | "start_datetime"
  | "duration"
  // 流量
  | "play_uv"
  | "max_concurrent_user_num"
  | "valid_acu"
  | "play_rate"
  | "per_play_time_avg"
  // 涨粉
  | "add_fans_cnt"
  | "transfer_fans_rate"
  // 互动
  | "like_cnt"
  | "comment_cnt"
  // 送礼营收
  | "send_gift_uv"
  | "live_amt"
  // 元数据
  | "data_source";

interface ColDef {
  key: ColKey;
  label: string;
  group: "基础" | "流量" | "涨粉" | "互动" | "送礼营收" | "其他";
  align?: "left" | "right";
  defaultVisible: boolean;
}

const COLUMNS: ColDef[] = [
  { key: "start_datetime", label: "开播时间", group: "基础", defaultVisible: true },
  { key: "duration", label: "时长", group: "基础", defaultVisible: true },
  { key: "play_uv", label: "有效观看", group: "流量", align: "right", defaultVisible: true },
  {
    key: "max_concurrent_user_num",
    label: "峰值",
    group: "流量",
    align: "right",
    defaultVisible: true,
  },
  { key: "valid_acu", label: "ACU", group: "流量", align: "right", defaultVisible: true },
  { key: "play_rate", label: "观看率", group: "流量", defaultVisible: true },
  { key: "per_play_time_avg", label: "人均观看时长", group: "流量", defaultVisible: false },
  { key: "add_fans_cnt", label: "涨粉", group: "涨粉", align: "right", defaultVisible: true },
  { key: "transfer_fans_rate", label: "转粉率", group: "涨粉", defaultVisible: false },
  { key: "like_cnt", label: "点赞", group: "互动", align: "right", defaultVisible: false },
  { key: "comment_cnt", label: "评论", group: "互动", align: "right", defaultVisible: false },
  {
    key: "send_gift_uv",
    label: "送礼人数",
    group: "送礼营收",
    align: "right",
    defaultVisible: true,
  },
  { key: "live_amt", label: "流水", group: "送礼营收", align: "right", defaultVisible: true },
  { key: "data_source", label: "来源", group: "其他", defaultVisible: true },
];

const STORAGE_KEY = "qjhy:kuaishou-session-cols";

function loadCols(): Set<ColKey> {
  if (typeof window === "undefined") {
    return new Set(COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as ColKey[];
      return new Set(arr);
    }
  } catch {
    /* fall through */
  }
  return new Set(COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));
}
function saveCols(set: Set<ColKey>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

export interface KuaishouAnchorRow {
  id: string;
  account_name: string;
  platform_account_id: string | null;
  avatar: string | null;
  product: string;
  agent_name: string | null;
  fans_count: number | null;
  joined_at: string | null;
  contract_expire_at: string | null;
  broker_name_raw: string | null;
}

interface SessionRow {
  live_stream_id: string;
  title: string | null;
  cover_url: string | null;
  start_datetime: string;
  end_datetime: string | null;
  live_duration_ms: number | null;
  live_duration_text: string | null;
  play_uv: number | null;
  play_user_cnt: number | null;
  max_concurrent_user_num: number | null;
  valid_acu: number | null;
  play_rate: string | null;
  per_play_time_avg_text: string | null;
  add_fans_cnt: number | null;
  transfer_fans_rate: string | null;
  like_cnt: number | null;
  comment_cnt: number | null;
  send_gift_uv: number | null;
  live_amt: number | null;
  data_source: string;
}

interface KpiResp {
  total_sessions: number;
  total_amt: number;
  total_add_fans: number;
  avg_acu: number;
  total_duration_hours: number;
  max_peak: number;
}

interface ApiResp {
  kpi: KpiResp;
  sessions: SessionRow[];
  days: number;
}

const DAYS_PRESETS: { value: number; label: string }[] = [
  { value: 7, label: "近 7 天" },
  { value: 30, label: "近 30 天" },
  { value: 90, label: "近 90 天" },
];

function fmtChinese(n: number): string {
  if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2).replace(/\.?0+$/, "") + "亿";
  if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(2).replace(/\.?0+$/, "") + "万";
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}
function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1e4) return "¥" + (n / 1e4).toFixed(2).replace(/\.?0+$/, "") + "万";
  return "¥" + n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  // 显示为 CST (UTC+8) — DB 存的是 UTC
  const local = new Date(d.getTime() + 8 * 3600_000);
  return local.toISOString().slice(0, 16).replace("T", " ");
}
function fmtDuration(ms: number | null, fallbackText: string | null): string {
  if (!ms) return fallbackText ?? "-";
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  return `${h}h ${m}m`;
}

export interface KuaishouAnchorDetailDrawerProps {
  anchor: KuaishouAnchorRow | null;
  onOpenChange: (open: boolean) => void;
}

export function KuaishouAnchorDetailDrawer({
  anchor,
  onOpenChange,
}: KuaishouAnchorDetailDrawerProps) {
  const open = anchor !== null;
  const [days, setDays] = useState(30);
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!anchor) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    fetch(
      `/api/anchors-kuaishou/${encodeURIComponent(anchor.platform_account_id ?? anchor.id)}/sessions?days=${days}`,
      { signal: ctrl.signal },
    )
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d: ApiResp) => setData(d))
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [anchor, days]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[1100px] !max-w-[80vw] gap-0 p-0 sm:max-w-none">
        <SheetTitle className="sr-only">{anchor?.account_name ?? "主播"}直播明细</SheetTitle>
        <SheetDescription className="sr-only">
          单个主播在指定时间窗内的所有直播场次数据
        </SheetDescription>

        {anchor && (
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="border-b border-slate-100 bg-white px-6 py-4">
              <div className="flex items-center gap-3">
                {anchor.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={anchor.avatar}
                    alt={anchor.account_name}
                    className="h-12 w-12 shrink-0 rounded-full object-cover ring-1 ring-slate-200"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-base font-semibold text-white">
                    {anchor.account_name.slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16px] font-semibold text-slate-900">
                    {anchor.account_name}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[12px] text-slate-500">
                    <span className="rounded bg-orange-50 px-1.5 py-0.5 text-[11px] font-medium text-orange-700">
                      快手
                    </span>
                    <span>{anchor.product}</span>
                    {anchor.platform_account_id && (
                      <span className="tabular-nums">ID {anchor.platform_account_id}</span>
                    )}
                    <span className="text-slate-300">·</span>
                    <span>经纪人: {anchor.agent_name ?? anchor.broker_name_raw ?? "-"}</span>
                    {anchor.fans_count != null && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span>粉丝 {fmtChinese(anchor.fans_count)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Toolbar - 时间窗 */}
            <PresetToolbar className="border-b border-slate-100 bg-white px-6 py-3">
              <span className="text-[12px] text-slate-500">时间窗</span>
              {DAYS_PRESETS.map((p) => (
                <PresetChip
                  key={p.value}
                  active={days === p.value}
                  onClick={() => setDays(p.value)}
                >
                  {p.label}
                </PresetChip>
              ))}
            </PresetToolbar>

            {/* Body */}
            <div className="flex-1 overflow-y-auto bg-slate-50/30 px-6 py-4">
              {loading && (
                <div className="flex items-center justify-center py-20 text-sm text-slate-400">
                  加载中…
                </div>
              )}
              {error && !loading && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  加载失败：{error}
                </div>
              )}
              {data && !loading && <DrawerBody kpi={data.kpi} sessions={data.sessions} />}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

type TrendKey = "live_amt" | "valid_acu" | "add_fans_cnt" | "max_peak" | "duration_h" | "sessions";

interface TrendMeta {
  label: string;
  agg: "sum" | "avg" | "max" | "count";
  fmt: (v: number) => string;
  color: string;
}

const TREND_META: Record<TrendKey, TrendMeta> = {
  live_amt: {
    label: "流水",
    agg: "sum",
    fmt: (v) => fmtMoney(v),
    color: "#1677ff",
  },
  valid_acu: {
    label: "ACU",
    agg: "avg",
    fmt: (v) => Math.round(v).toString(),
    color: "#13c2c2",
  },
  add_fans_cnt: {
    label: "涨粉",
    agg: "sum",
    fmt: (v) => fmtChinese(v),
    color: "#52c41a",
  },
  max_peak: {
    label: "峰值在线",
    agg: "max",
    fmt: (v) => fmtChinese(v),
    color: "#fa8c16",
  },
  duration_h: {
    label: "直播时长",
    agg: "sum",
    fmt: (v) => `${v.toFixed(1)}h`,
    color: "#722ed1",
  },
  sessions: {
    label: "场次",
    agg: "count",
    fmt: (v) => v.toString(),
    color: "#eb2f96",
  },
};

function aggregateByDay(sessions: SessionRow[], key: TrendKey): { date: string; value: number }[] {
  // 按 start_datetime 的 CST 日期分组（"YYYY-MM-DD"）
  const map = new Map<string, number[]>();
  for (const s of sessions) {
    const local = new Date(new Date(s.start_datetime).getTime() + 8 * 3600_000);
    const day = local.toISOString().slice(0, 10);
    if (!map.has(day)) map.set(day, []);
    let v: number | null = null;
    if (key === "live_amt") v = s.live_amt;
    else if (key === "valid_acu") v = s.valid_acu;
    else if (key === "add_fans_cnt") v = s.add_fans_cnt;
    else if (key === "max_peak") v = s.max_concurrent_user_num;
    else if (key === "duration_h")
      v = s.live_duration_ms != null ? s.live_duration_ms / 3600_000 : null;
    else if (key === "sessions") v = 1;
    if (v != null) {
      const arr = map.get(day);
      if (arr) arr.push(v);
    }
  }
  const meta = TREND_META[key];
  const result: { date: string; value: number }[] = [];
  // 按日期升序
  const sortedDays = [...map.keys()].sort();
  for (const day of sortedDays) {
    const arr = map.get(day) ?? [];
    let agg: number;
    if (meta.agg === "sum") agg = arr.reduce((a, b) => a + b, 0);
    else if (meta.agg === "avg") agg = arr.reduce((a, b) => a + b, 0) / arr.length;
    else if (meta.agg === "max") agg = Math.max(...arr);
    else agg = arr.length; // count
    result.push({ date: day.slice(5), value: agg }); // "MM-DD"
  }
  return result;
}

function DrawerBody({ kpi, sessions }: { kpi: KpiResp; sessions: SessionRow[] }) {
  const [selectedTrend, setSelectedTrend] = useState<TrendKey>("live_amt");

  const kpiItems: KpiItem[] = [
    { key: "sessions", label: "场次", value: kpi.total_sessions.toString() },
    { key: "live_amt", label: "总流水", value: fmtMoney(kpi.total_amt) },
    {
      key: "valid_acu",
      label: "平均 ACU",
      value: kpi.avg_acu > 0 ? Math.round(kpi.avg_acu).toString() : "-",
    },
    { key: "max_peak", label: "峰值在线", value: fmtChinese(kpi.max_peak) },
    {
      key: "add_fans_cnt",
      label: "总涨粉",
      value: kpi.total_add_fans > 0 ? fmtChinese(kpi.total_add_fans) : "-",
    },
    {
      key: "duration_h",
      label: "总直播时长",
      value: kpi.total_duration_hours > 0 ? `${kpi.total_duration_hours.toFixed(1)} 小时` : "-",
    },
  ];

  const trendData = useMemo(
    () => aggregateByDay(sessions, selectedTrend),
    [sessions, selectedTrend],
  );
  const trendMeta = TREND_META[selectedTrend];

  return (
    <div className="flex flex-col gap-4">
      <KpiGrid
        items={kpiItems}
        activeKey={selectedTrend}
        onSelect={(k) => setSelectedTrend(k as TrendKey)}
      />

      {/* 趋势图 */}
      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <span className="text-[13px] font-medium text-slate-700">
              按天{trendMeta.agg === "avg" ? "均值" : trendMeta.agg === "max" ? "峰值" : "总和"}
              ·{" "}
            </span>
            <span className="text-[13px] text-slate-500">{trendMeta.label}</span>
          </div>
          <span className="text-[11px] text-slate-400">点击 KPI 卡切换指标</span>
        </div>
        {trendData.length === 0 ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-slate-400">
            该时间窗内无直播
          </div>
        ) : (
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`trend-${selectedTrend}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={trendMeta.color} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={trendMeta.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  tickLine={false}
                  axisLine={{ stroke: "#e2e8f0" }}
                  minTickGap={20}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tickFormatter={(v) => trendMeta.fmt(v)}
                />
                <Tooltip
                  contentStyle={{
                    background: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  formatter={(v) => [
                    typeof v === "number" ? trendMeta.fmt(v) : "—",
                    trendMeta.label,
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={trendMeta.color}
                  strokeWidth={2}
                  fill={`url(#trend-${selectedTrend})`}
                  dot={{ r: 3, fill: trendMeta.color }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 场次列表 + 列勾选 */}
      <SessionTable sessions={sessions} />
    </div>
  );
}

function SessionTable({ sessions }: { sessions: SessionRow[] }) {
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => loadCols());
  const [picker, setPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!picker) return;
    const h = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPicker(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [picker]);

  const cols = useMemo(() => COLUMNS.filter((c) => visibleCols.has(c.key)), [visibleCols]);

  const renderCell = (col: ColDef, s: SessionRow): React.ReactNode => {
    switch (col.key) {
      case "start_datetime":
        return (
          <>
            <div className="font-medium">{fmtDateTime(s.start_datetime)}</div>
            {s.title && (
              <div className="mt-0.5 max-w-[200px] truncate text-[10.5px] text-slate-400">
                {s.title}
              </div>
            )}
          </>
        );
      case "duration":
        return fmtDuration(s.live_duration_ms, s.live_duration_text);
      case "play_uv":
        return s.play_uv != null ? fmtChinese(s.play_uv) : "-";
      case "max_concurrent_user_num":
        return s.max_concurrent_user_num != null ? fmtChinese(s.max_concurrent_user_num) : "-";
      case "valid_acu":
        return s.valid_acu != null ? Math.round(s.valid_acu) : "-";
      case "play_rate":
        return s.play_rate ?? "-";
      case "per_play_time_avg":
        return s.per_play_time_avg_text ?? "-";
      case "add_fans_cnt":
        return s.add_fans_cnt != null ? s.add_fans_cnt : "-";
      case "transfer_fans_rate":
        return s.transfer_fans_rate ?? "-";
      case "like_cnt":
        return s.like_cnt != null ? fmtChinese(s.like_cnt) : "-";
      case "comment_cnt":
        return s.comment_cnt != null ? fmtChinese(s.comment_cnt) : "-";
      case "send_gift_uv":
        return s.send_gift_uv != null ? s.send_gift_uv : "-";
      case "live_amt":
        return s.live_amt != null ? (
          <span className="font-medium text-slate-900">{fmtMoney(s.live_amt)}</span>
        ) : (
          "-"
        );
      case "data_source":
        return (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium",
              s.data_source === "today"
                ? "bg-blue-50 text-blue-700"
                : "bg-slate-100 text-slate-600",
            )}
          >
            {s.data_source === "today" ? "实时" : "权威"}
          </span>
        );
      default:
        return "-";
    }
  };

  return (
    <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <span className="text-[13px] font-medium text-slate-700">场次明细 ({sessions.length})</span>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-slate-400">按开播时间倒序</span>
          <div ref={pickerRef} className="relative">
            <button
              type="button"
              onClick={() => setPicker(!picker)}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-[11.5px] text-slate-600 hover:border-slate-300 hover:text-slate-800"
            >
              列设置 ({visibleCols.size}/{COLUMNS.length})
            </button>
            {picker && (
              <div className="absolute right-0 top-full z-50 mt-1 w-[260px] rounded-md border border-slate-200 bg-white p-3 shadow-lg">
                {(["基础", "流量", "涨粉", "互动", "送礼营收", "其他"] as const).map((g) => {
                  const groupCols = COLUMNS.filter((c) => c.group === g);
                  if (groupCols.length === 0) return null;
                  return (
                    <div key={g} className="mb-2 last:mb-0">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        {g}
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                        {groupCols.map((c) => (
                          <label
                            key={c.key}
                            className="flex cursor-pointer items-center gap-1.5 text-[12px] text-slate-700 hover:text-slate-900"
                          >
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 cursor-pointer accent-blue-500"
                              checked={visibleCols.has(c.key)}
                              onChange={(e) => {
                                const next = new Set(visibleCols);
                                if (e.target.checked) next.add(c.key);
                                else next.delete(c.key);
                                setVisibleCols(next);
                                saveCols(next);
                              }}
                            />
                            {c.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <div className="mt-2 flex justify-end gap-2 border-t border-slate-100 pt-2">
                  <button
                    onClick={() => {
                      const next = new Set<ColKey>(
                        COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key),
                      );
                      setVisibleCols(next);
                      saveCols(next);
                    }}
                    className="text-[11px] text-slate-500 hover:text-slate-700"
                  >
                    重置默认
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {sessions.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm text-slate-400">该时间窗内无直播</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]" style={{ fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[11px] font-medium text-slate-500">
                {cols.map((c) => (
                  <th key={c.key} className={cn("px-3 py-2", c.align === "right" && "text-right")}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr
                  key={s.live_stream_id}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50"
                >
                  {cols.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "px-3 py-2 text-slate-700",
                        c.align === "right" && "text-right",
                      )}
                    >
                      {renderCell(c, s)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
