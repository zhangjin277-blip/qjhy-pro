"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";
import { Music2 } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnchorDailyResponse, AnchorDailyRow, AnchorListRow } from "@/modules/anchors";
import { formatChineseNumber, formatCellValue } from "./format";
import type { ColumnDef } from "./column-presets";

// ─── 工具：选择哪些列适合做 chart / sparkline ────────────────────────────────
type ChartableFmt = "number" | "duration" | "percent";
function isChartable(c: ColumnDef): c is ColumnDef & { fmt: ChartableFmt } {
  return c.fmt === "number" || c.fmt === "duration" || c.fmt === "percent";
}

/** 哪些指标 30 天聚合应该取 max（峰值）而不是 sum */
const MAX_KEYS = new Set<string>([
  // game cps live ACU/PCU
  "g_acu",
  "g_pcu",
  // minigame ACU/PCU
  "mg_acu",
  "mg_pcu",
  // anchor_daily 峰值类
  "feed_acu",
  "peak_per_minute_ucnt",
  "total_fans",
  "current_percent",
  "profit_share_ratio",
]);

/** 哪些指标按 percent 聚合（取 average）*/
function isPercentKey(c: ColumnDef): boolean {
  return c.fmt === "percent";
}

/** 数组聚合：percent → avg；max keys → max；其他 → sum */
function aggregateRows(rows: AnchorDailyRow[], col: ColumnDef): number {
  const key = col.key as keyof AnchorDailyRow;
  if (isPercentKey(col)) {
    let sum = 0;
    let cnt = 0;
    for (const r of rows) {
      const v = r[key];
      if (typeof v === "number") {
        sum += v;
        cnt += 1;
      }
    }
    return cnt > 0 ? sum / cnt : 0;
  }
  if (MAX_KEYS.has(col.key)) {
    let m = 0;
    for (const r of rows) {
      const v = r[key];
      if (typeof v === "number" && v > m) m = v;
    }
    return m;
  }
  let s = 0;
  for (const r of rows) {
    const v = r[key];
    if (typeof v === "number") s += v;
  }
  return s;
}

function compareDelta(
  cur: number,
  prev: number,
  periodDays: number,
): { text: string; kind: "up" | "down" | "flat" } | null {
  if (prev === 0) {
    if (cur === 0) return { text: `较前${periodDays}日 持平`, kind: "flat" };
    return null;
  }
  if (cur === prev) return { text: `较前${periodDays}日 持平`, kind: "flat" };
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  const arrow = pct > 0 ? "↑" : "↓";
  return {
    text: `较前${periodDays}日 ${arrow}${Math.abs(pct).toFixed(2)}%`,
    kind: pct > 0 ? "up" : "down",
  };
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export interface AnchorDetailDrawerProps {
  anchor: AnchorListRow | null;
  dateFrom: string;
  dateTo: string;
  /** 顶部 KPI 卡片对应的列 */
  kpiColumns: ColumnDef[];
  /** 列表当前显示的所有列（drawer 据此动态渲染 sparkline + 表格）*/
  visibleColumns: ColumnDef[];
  onOpenChange: (open: boolean) => void;
}

export function AnchorDetailDrawer({
  anchor,
  dateFrom,
  dateTo,
  kpiColumns,
  visibleColumns,
  onOpenChange,
}: AnchorDetailDrawerProps) {
  const [data, setData] = useState<AnchorDailyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const open = anchor !== null;

  // 拉数据
  useEffect(() => {
    if (!anchor) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    const ctrl = new AbortController();
    fetch(
      `/api/anchors/${encodeURIComponent(anchor.anchor_id)}/daily?date_from=${dateFrom}&date_to=${dateTo}`,
      { signal: ctrl.signal },
    )
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d: AnchorDailyResponse) => setData(d))
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [anchor, dateFrom, dateTo]);

  const periodDays = useMemo(() => {
    const ms = Date.parse(dateTo) - Date.parse(dateFrom);
    return Math.round(ms / 86_400_000) + 1;
  }, [dateFrom, dateTo]);

  // KPI 列（只取 chartable）
  const kpiCols = useMemo(() => kpiColumns.filter(isChartable), [kpiColumns]);
  // sparkline 网格 = visibleColumns 里 chartable - kpiCols
  const sparkCols = useMemo(() => {
    const kpiSet = new Set(kpiCols.map((c) => c.key));
    return visibleColumns.filter((c) => isChartable(c) && !kpiSet.has(c.key));
  }, [visibleColumns, kpiCols]);
  // 日明细表 = visibleColumns 全部 chartable（KPI 也包括）
  const tableCols = useMemo(() => visibleColumns.filter(isChartable), [visibleColumns]);

  // 默认选中第一个 KPI 列做趋势图；若无 KPI，用第一个 chartable 列
  const defaultSelectedKey = kpiCols[0]?.key ?? sparkCols[0]?.key ?? "total_fan_ticket";
  const effectiveSelectedKey = selectedKey ?? defaultSelectedKey;
  const selectedCol =
    [...kpiCols, ...sparkCols].find((c) => c.key === effectiveSelectedKey) ??
    kpiCols[0] ??
    sparkCols[0] ??
    null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[1280px] !max-w-[80vw] gap-0 p-0 sm:max-w-none">
        <SheetTitle className="sr-only">{anchor?.nick_name ?? "主播"}日明细</SheetTitle>
        <SheetDescription className="sr-only">
          单个主播在 {dateFrom} 至 {dateTo} 的日明细数据
        </SheetDescription>

        {anchor && (
          <DrawerInner
            anchor={anchor}
            dateFrom={dateFrom}
            dateTo={dateTo}
            periodDays={periodDays}
            data={data}
            loading={loading}
            error={error}
            kpiCols={kpiCols}
            sparkCols={sparkCols}
            tableCols={tableCols}
            selectedCol={selectedCol}
            onSelectKey={setSelectedKey}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── 抽屉内容 ────────────────────────────────────────────────────────────────

interface DrawerInnerProps {
  anchor: AnchorListRow;
  dateFrom: string;
  dateTo: string;
  periodDays: number;
  data: AnchorDailyResponse | null;
  loading: boolean;
  error: string | null;
  kpiCols: ColumnDef[];
  sparkCols: ColumnDef[];
  tableCols: ColumnDef[];
  selectedCol: ColumnDef | null;
  onSelectKey: (k: string) => void;
}

function DrawerInner({
  anchor,
  dateFrom,
  dateTo,
  periodDays,
  data,
  loading,
  error,
  kpiCols,
  sparkCols,
  tableCols,
  selectedCol,
  onSelectKey,
}: DrawerInnerProps) {
  const cur = data?.current ?? [];
  const cmp = data?.compare ?? [];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b bg-card px-8 pt-6 pb-4">
        <div className="text-muted-foreground mb-3 text-xs">
          主播明细 · <span className="text-foreground/70">{anchor.nick_name}</span> · 数据详情
        </div>
        <div className="flex items-center gap-4">
          {anchor.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={anchor.avatar}
              alt={anchor.nick_name}
              className="size-13 shrink-0 rounded-full bg-muted object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="size-13 shrink-0 rounded-full bg-muted" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold text-foreground">
                {anchor.nick_name || "—"}
              </span>
              <span className="inline-flex h-5 items-center rounded bg-primary/10 px-2 text-xs font-medium text-primary">
                {anchor.is_threekingdoms ? "三国" : "斗地主"}
              </span>
              {anchor.recruit_broker_name && (
                <span className="bg-muted text-muted-foreground inline-flex h-5 items-center rounded px-2 text-xs font-medium">
                  {anchor.recruit_broker_name}
                </span>
              )}
            </div>
            <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
              {anchor.aweme_display_id && (
                <span className="inline-flex items-center gap-1">
                  <Music2 className="size-3" />
                  <span>{anchor.aweme_display_id}</span>
                </span>
              )}
              <span>
                UID <span className="text-foreground/70">{anchor.anchor_id}</span>
              </span>
              {anchor.broker_name && (
                <span>
                  运营 <span className="text-foreground/70">{anchor.broker_name}</span>
                </span>
              )}
              {anchor.recruit_broker_name && (
                <span>
                  招募 <span className="text-foreground/70">{anchor.recruit_broker_name}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 border-t pt-3">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <span>📅</span>
            <span className="text-foreground/80">
              {dateFrom} ~ {dateTo}
            </span>
            <span className="ml-1">· 共 {periodDays} 天</span>
            <span className="ml-3 text-muted-foreground/70">
              指标跟随列表当前选择（KPI {kpiCols.length} 项 · 全部 {tableCols.length} 项）
            </span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="bg-background flex-1 overflow-y-auto px-7 py-5">
        {error && (
          <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
            数据加载失败：{error}
          </div>
        )}

        {/* 核心 KPI 卡 */}
        {kpiCols.length > 0 && (
          <SectionBlock label="核心指标" hint="点击卡片切换上方趋势图">
            <KpiGrid
              cols={kpiCols}
              rows={cur}
              prevRows={cmp}
              periodDays={periodDays}
              loading={loading}
              selectedKey={selectedCol?.key ?? null}
              onSelect={onSelectKey}
            />
          </SectionBlock>
        )}

        {/* 趋势图 */}
        {selectedCol && (
          <SectionBlock label={`趋势走势 · ${selectedCol.label}`} hint="虚线为同期对比">
            <TrendChart
              cur={cur}
              cmp={cmp}
              col={selectedCol}
              periodDays={periodDays}
              loading={loading}
            />
          </SectionBlock>
        )}

        {/* sparkline 网格 */}
        {sparkCols.length > 0 && (
          <SectionBlock label="其它指标" hint="点击任一卡片切换上方趋势图">
            <SparkGrid
              cols={sparkCols}
              rows={cur}
              prevRows={cmp}
              periodDays={periodDays}
              loading={loading}
              selectedKey={selectedCol?.key ?? null}
              onSelect={onSelectKey}
            />
          </SectionBlock>
        )}

        {/* 日明细表 */}
        <DailyTable cols={tableCols} rows={cur} loading={loading} />
      </div>
    </div>
  );
}

// ─── 容器 ───────────────────────────────────────────────────────────────────

function SectionBlock({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4 rounded-lg border bg-card p-4 last:mb-0">
      <div className="mb-3 flex items-center gap-2">
        <span className="bg-primary block h-3 w-[3px] rounded" />
        <span className="text-foreground/80 text-xs font-medium tracking-wide">{label}</span>
        {hint && <span className="text-muted-foreground ml-auto text-xs">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

// ─── KPI 网格 ───────────────────────────────────────────────────────────────

function KpiGrid({
  cols,
  rows,
  prevRows,
  periodDays,
  loading,
  selectedKey,
  onSelect,
}: {
  cols: ColumnDef[];
  rows: AnchorDailyRow[];
  prevRows: AnchorDailyRow[];
  periodDays: number;
  loading: boolean;
  selectedKey: string | null;
  onSelect: (k: string) => void;
}) {
  const colCount = Math.min(cols.length, 6);
  const gridCols =
    colCount <= 3
      ? "grid-cols-3"
      : colCount === 4
        ? "grid-cols-4"
        : colCount === 5
          ? "grid-cols-5"
          : "grid-cols-6";
  return (
    <div className={cn("grid gap-2.5", gridCols)}>
      {cols.map((col) => (
        <KpiCard
          key={col.key}
          col={col}
          rows={rows}
          prevRows={prevRows}
          periodDays={periodDays}
          loading={loading}
          selected={selectedKey === col.key}
          onClick={() => onSelect(col.key)}
        />
      ))}
    </div>
  );
}

function KpiCard({
  col,
  rows,
  prevRows,
  periodDays,
  loading,
  selected,
  onClick,
}: {
  col: ColumnDef;
  rows: AnchorDailyRow[];
  prevRows: AnchorDailyRow[];
  periodDays: number;
  loading: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  if (loading) {
    return (
      <div className="rounded-md border bg-card p-3.5">
        <Skeleton className="mb-1.5 h-3 w-12" />
        <Skeleton className="mb-1 h-6 w-20" />
        <Skeleton className="h-2.5 w-24" />
      </div>
    );
  }
  const cur = aggregateRows(rows, col);
  const prev = aggregateRows(prevRows, col);
  const delta = compareDelta(cur, prev, periodDays);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border bg-card p-3.5 text-left transition-all",
        "hover:border-foreground/15",
        selected
          ? "border-primary bg-gradient-to-b from-primary/5 to-transparent ring-3 ring-primary/8"
          : "",
      )}
    >
      <div className="text-muted-foreground mb-1 text-xs">{col.label}</div>
      <div className="text-foreground text-[22px] leading-tight font-bold tabular-nums tracking-tight">
        {formatCellValue(cur, col.fmt)}
      </div>
      {delta && (
        <div className="text-muted-foreground mt-1 flex items-center gap-1 text-[11px]">
          <span>{delta.text.split(" ")[0]}</span>
          <span
            className={cn(
              delta.kind === "up" && "text-[var(--change-up)]",
              delta.kind === "down" && "text-[var(--change-down)]",
            )}
          >
            {delta.text.split(" ").slice(1).join(" ")}
          </span>
        </div>
      )}
    </button>
  );
}

// ─── sparkline 网格 ─────────────────────────────────────────────────────────

function SparkGrid({
  cols,
  rows,
  prevRows,
  periodDays,
  loading,
  selectedKey,
  onSelect,
}: {
  cols: ColumnDef[];
  rows: AnchorDailyRow[];
  prevRows: AnchorDailyRow[];
  periodDays: number;
  loading: boolean;
  selectedKey: string | null;
  onSelect: (k: string) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {cols.map((col) => (
        <SparkCard
          key={col.key}
          col={col}
          rows={rows}
          prevRows={prevRows}
          periodDays={periodDays}
          loading={loading}
          selected={selectedKey === col.key}
          onClick={() => onSelect(col.key)}
        />
      ))}
    </div>
  );
}

function SparkCard({
  col,
  rows,
  prevRows,
  periodDays,
  loading,
  selected,
  onClick,
}: {
  col: ColumnDef;
  rows: AnchorDailyRow[];
  prevRows: AnchorDailyRow[];
  periodDays: number;
  loading: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  if (loading) {
    return (
      <div className="rounded-md border bg-card p-3">
        <Skeleton className="mb-1 h-2.5 w-16" />
        <Skeleton className="mb-1 h-4 w-14" />
        <Skeleton className="h-6 w-full" />
      </div>
    );
  }
  const cur = aggregateRows(rows, col);
  const prev = aggregateRows(prevRows, col);
  const delta = compareDelta(cur, prev, periodDays);
  const key = col.key as keyof AnchorDailyRow;
  const sparkData = rows.map((r) => ({
    date: r.date,
    v: typeof r[key] === "number" ? (r[key] as number) : 0,
  }));
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border bg-card p-3 text-left transition-all",
        "hover:border-foreground/15",
        selected
          ? "border-primary bg-gradient-to-b from-primary/5 to-transparent ring-3 ring-primary/8"
          : "",
      )}
    >
      <div className="text-muted-foreground truncate text-[11px]">{col.label}</div>
      <div className="text-foreground mt-0.5 text-base leading-tight font-bold tabular-nums tracking-tight">
        {formatCellValue(cur, col.fmt)}
      </div>
      {delta && (
        <div className="text-muted-foreground mt-0.5 text-[10px]">
          较前{periodDays}{" "}
          <span
            className={cn(
              "font-medium",
              delta.kind === "up" && "text-[var(--change-up)]",
              delta.kind === "down" && "text-[var(--change-down)]",
            )}
          >
            {delta.text.split(" ").slice(1).join(" ")}
          </span>
        </div>
      )}
      <div className="mt-1.5 h-6 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sparkData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <Line
              type="monotone"
              dataKey="v"
              stroke="var(--color-gray-400, #86909c)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </button>
  );
}

// ─── 趋势折线图 ─────────────────────────────────────────────────────────────

function TrendChart({
  cur,
  cmp,
  col,
  periodDays,
  loading,
}: {
  cur: AnchorDailyRow[];
  cmp: AnchorDailyRow[];
  col: ColumnDef;
  periodDays: number;
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-[260px] w-full rounded-md" />;

  const total = aggregateRows(cur, col);
  const prevTotal = aggregateRows(cmp, col);
  const delta = compareDelta(total, prevTotal, periodDays);
  const key = col.key as keyof AnchorDailyRow;

  const chartData = cur.map((r, i) => ({
    date: r.date.slice(5),
    cur: typeof r[key] === "number" ? (r[key] as number) : null,
    cmp: cmp[i] && typeof cmp[i][key] === "number" ? (cmp[i][key] as number) : null,
  }));

  return (
    <div>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="text-muted-foreground text-sm">
          当前周期{col.fmt === "percent" ? "均值" : "总和"}
        </span>
        <span className="text-foreground text-2xl font-bold tabular-nums">
          {formatCellValue(total, col.fmt)}
        </span>
        {delta && (
          <span
            className={cn(
              "text-sm font-medium",
              delta.kind === "up" && "text-[var(--change-up)]",
              delta.kind === "down" && "text-[var(--change-down)]",
              delta.kind === "flat" && "text-muted-foreground",
            )}
          >
            {delta.text.split(" ").slice(1).join(" ")}
          </span>
        )}
      </div>
      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="cur-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.18} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              minTickGap={20}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v) =>
                col.fmt === "percent" ? `${(v * 100).toFixed(0)}%` : formatChineseNumber(v)
              }
            />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--foreground)", fontWeight: 500, marginBottom: 4 }}
              formatter={(value, name) => [
                typeof value === "number" ? formatCellValue(value, col.fmt) : "—",
                name === "cur" ? "本周期" : "前同期",
              ]}
            />
            <Area
              type="monotone"
              dataKey="cur"
              stroke="var(--primary)"
              strokeWidth={2}
              fill="url(#cur-area)"
              dot={false}
              activeDot={{ r: 4, fill: "var(--primary)" }}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="cmp"
              stroke="var(--chart-compare)"
              strokeWidth={2}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="text-muted-foreground mt-2 flex gap-4 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-primary inline-block h-[2px] w-3.5" />
          本周期
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-0 w-3.5"
            style={{ borderTop: "2px dashed var(--chart-compare)" }}
          />
          前 {periodDays} 日同期
        </span>
      </div>
    </div>
  );
}

// ─── 日明细表 ───────────────────────────────────────────────────────────────

function DailyTable({
  cols,
  rows,
  loading,
}: {
  cols: ColumnDef[];
  rows: AnchorDailyRow[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <SectionBlock label={`日明细 · 全部 ${cols.length} 项指标`}>
        <Skeleton className="h-48 w-full rounded" />
      </SectionBlock>
    );
  }
  return (
    <SectionBlock label={`日明细 · 全部 ${cols.length} 项指标`}>
      <div className="-mx-4 -mb-4 overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground">
              <th className="sticky left-0 z-1 bg-muted/50 px-3 py-2 text-left font-medium">
                日期
              </th>
              {cols.map((c) => (
                <th key={c.key} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={cols.length + 1} className="text-muted-foreground py-8 text-center">
                  无数据
                </td>
              </tr>
            ) : (
              rows
                .slice()
                .reverse()
                .map((r) => (
                  <tr key={r.date} className="hover:bg-accent/30 border-t">
                    <td className="sticky left-0 z-1 bg-card text-muted-foreground px-3 py-2 text-left whitespace-nowrap">
                      {r.date.slice(5)}
                    </td>
                    {cols.map((c) => {
                      const v = r[c.key as keyof AnchorDailyRow];
                      return (
                        <td key={c.key} className="px-3 py-2 text-right whitespace-nowrap">
                          {typeof v === "number" ? formatCellValue(v, c.fmt) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </SectionBlock>
  );
}
