"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { ColumnDef } from "./column-presets";
import type { KuaishouColKey } from "./kuaishou-column-presets";

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
  live_duration_text: string | null;
  data_source: string;
  // 主表 ColKey 对应单场值（数值列；可为 null）
  [k: string]: string | number | null;
}

interface ApiResp {
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
  const local = new Date(d.getTime() + 8 * 3600_000);
  return local.toISOString().slice(0, 16).replace("T", " ");
}

type ChartableFmt = "number" | "duration" | "percent";
function isChartable(
  c: ColumnDef<KuaishouColKey>,
): c is ColumnDef<KuaishouColKey> & { fmt: ChartableFmt } {
  return c.fmt === "number" || c.fmt === "duration" || c.fmt === "percent";
}

function fmtCol(col: ColumnDef<KuaishouColKey>, v: number): string {
  // 流水/竖屏/聊天室 用 fmtMoney；其他 number 用 fmtChinese
  const moneyKeys: string[] = ["total_amt", "total_live_video_amt", "total_live_chat_room_amt"];
  if (col.fmt === "percent") return `${(v * 100).toFixed(2)}%`;
  if (col.fmt === "duration") return `${v.toFixed(1)}h`;
  if (moneyKeys.includes(col.key as string)) return fmtMoney(v);
  return fmtChinese(v);
}

/** 单场聚合到 KPI 数值。max_peak/max_fans_club_cnt 用 MAX；avg_* 用 AVG；其他 SUM */
function aggregateSessions(sessions: SessionRow[], col: ColumnDef<KuaishouColKey>): number {
  const key = col.key as string;
  const get = (s: SessionRow): number | null => {
    const v = s[key];
    return typeof v === "number" ? v : null;
  };
  const vals = sessions.map(get).filter((v): v is number => v != null);
  if (vals.length === 0) return 0;
  if (col.fmt === "percent") return vals.reduce((a, b) => a + b, 0) / vals.length;
  if (key === "max_peak" || key === "max_fans_club_cnt") return Math.max(...vals);
  if (key.startsWith("avg_")) return vals.reduce((a, b) => a + b, 0) / vals.length;
  return vals.reduce((a, b) => a + b, 0);
}

export interface KuaishouAnchorDetailDrawerProps {
  anchor: KuaishouAnchorRow | null;
  /** 主表当前可见列（含 pinned）— 抽屉用其 chartable 子集渲染单场表 */
  visibleColumns: ColumnDef<KuaishouColKey>[];
  /** 主表当前 KPI 列（快手 server kpi 模式时为空，则 fallback 到 visibleColumns 前 6 chartable） */
  kpiColumns: ColumnDef<KuaishouColKey>[];
  onOpenChange: (open: boolean) => void;
}

export function KuaishouAnchorDetailDrawer({
  anchor,
  visibleColumns,
  kpiColumns,
  onOpenChange,
}: KuaishouAnchorDetailDrawerProps): React.JSX.Element {
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
          const body = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<ApiResp>;
      })
      .then((d) => setData(d))
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [anchor, days]);

  // KPI 列：优先用主表 kpiColumns；空则用 visibleColumns 前 6 chartable
  const kpiCols = useMemo<ColumnDef<KuaishouColKey>[]>(() => {
    const fromKpi = kpiColumns.filter(isChartable);
    if (fromKpi.length > 0) return fromKpi;
    return visibleColumns.filter(isChartable).slice(0, 6);
  }, [kpiColumns, visibleColumns]);

  // 单场表列：visibleColumns 全部 chartable
  const tableCols = useMemo(() => visibleColumns.filter(isChartable), [visibleColumns]);

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

            {/* Toolbar 时间窗 */}
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
              {data && !loading && (
                <DrawerBody sessions={data.sessions} kpiCols={kpiCols} tableCols={tableCols} />
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({
  sessions,
  kpiCols,
  tableCols,
}: {
  sessions: SessionRow[];
  kpiCols: ColumnDef<KuaishouColKey>[];
  tableCols: ColumnDef<KuaishouColKey>[];
}): React.JSX.Element {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const kpiItems: KpiItem[] = kpiCols.map((c) => {
    const v = aggregateSessions(sessions, c);
    return {
      key: c.key as string,
      label: c.label,
      value: v > 0 ? fmtCol(c, v) : "-",
    };
  });

  const effectiveKey = selectedKey ?? (kpiCols[0]?.key as string) ?? null;
  const selectedCol = kpiCols.find((c) => (c.key as string) === effectiveKey) ?? kpiCols[0] ?? null;

  // 按天聚合趋势数据
  const trendData = useMemo(() => {
    if (!selectedCol) return [];
    const colKey = selectedCol.key as string;
    const map = new Map<string, number[]>();
    for (const s of sessions) {
      const local = new Date(new Date(s.start_datetime).getTime() + 8 * 3600_000);
      const day = local.toISOString().slice(0, 10);
      const v = s[colKey];
      if (typeof v !== "number") continue;
      const arr = map.get(day) ?? [];
      arr.push(v);
      map.set(day, arr);
    }
    const days = [...map.keys()].sort();
    return days.map((d) => {
      const arr = map.get(d) ?? [];
      let v: number;
      if (selectedCol.fmt === "percent") {
        v = arr.reduce((a, b) => a + b, 0) / arr.length;
      } else if (colKey === "max_peak" || colKey === "max_fans_club_cnt") {
        v = Math.max(...arr);
      } else if (colKey.startsWith("avg_")) {
        v = arr.reduce((a, b) => a + b, 0) / arr.length;
      } else {
        v = arr.reduce((a, b) => a + b, 0);
      }
      return { date: d.slice(5), value: v };
    });
  }, [sessions, selectedCol]);

  return (
    <div className="flex flex-col gap-4">
      <KpiGrid
        items={kpiItems}
        activeKey={effectiveKey ?? undefined}
        onSelect={(k) => setSelectedKey(String(k))}
      />

      {/* 趋势图 */}
      {selectedCol && (
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between">
            <div>
              <span className="text-[13px] font-medium text-slate-700">
                按天
                {selectedCol.fmt === "percent" || String(selectedCol.key).startsWith("avg_")
                  ? "均值"
                  : String(selectedCol.key) === "max_peak" ||
                      String(selectedCol.key) === "max_fans_club_cnt"
                    ? "峰值"
                    : "总和"}
                ·{" "}
              </span>
              <span className="text-[13px] text-slate-500">{selectedCol.label}</span>
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
                    <linearGradient id="ks-trend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1677ff" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#1677ff" stopOpacity={0} />
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
                    tickFormatter={(v: number) => fmtCol(selectedCol, v)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "white",
                      border: "1px solid #e2e8f0",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                    formatter={(v) => [
                      typeof v === "number" ? fmtCol(selectedCol, v) : "—",
                      selectedCol.label,
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#1677ff"
                    strokeWidth={2}
                    fill="url(#ks-trend)"
                    dot={{ r: 3, fill: "#1677ff" }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* 场次列表 */}
      <SessionTable sessions={sessions} cols={tableCols} />
    </div>
  );
}

function SessionTable({
  sessions,
  cols,
}: {
  sessions: SessionRow[];
  cols: ColumnDef<KuaishouColKey>[];
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <span className="text-[13px] font-medium text-slate-700">场次明细 ({sessions.length})</span>
        <span className="text-[11px] text-slate-400">
          按开播时间倒序 · 列跟随主表 ({cols.length} 项)
        </span>
      </div>
      {sessions.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm text-slate-400">该时间窗内无直播</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]" style={{ fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[11px] font-medium text-slate-500">
                <th className="sticky left-0 z-10 bg-slate-50/60 px-3 py-2">开播时间</th>
                <th className="px-3 py-2">来源</th>
                {cols.map((c) => (
                  <th
                    key={c.key as string}
                    className={cn(
                      "px-3 py-2 whitespace-nowrap",
                      c.align === "right" && "text-right",
                    )}
                  >
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
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 group-hover:bg-slate-50/50">
                    <div className="font-medium text-slate-900">
                      {fmtDateTime(s.start_datetime)}
                    </div>
                    {s.title && (
                      <div className="mt-0.5 max-w-[200px] truncate text-[10.5px] text-slate-400">
                        {s.title}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
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
                  </td>
                  {cols.map((c) => {
                    const v = s[c.key as string];
                    const display =
                      typeof v === "number" ? (
                        fmtCol(c, v)
                      ) : (
                        <span className="text-slate-400">-</span>
                      );
                    return (
                      <td
                        key={c.key as string}
                        className={cn(
                          "px-3 py-2 text-slate-700 whitespace-nowrap",
                          c.align === "right" && "text-right",
                        )}
                      >
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
