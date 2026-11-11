"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Music2 } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";
import {
  PROJECT_LABELS,
  type DrawerDailyRow,
  type DrawerDetailResponse,
  type DrawerKpiBlock,
  type DrawerMetric,
  type DrawerTopAnchor,
  type GroupKey,
  type ProjectKey,
} from "@/modules/dashboard";
import { formatChineseNumber } from "./format";

/**
 * Drawer 打开载荷：携带初始选中的 metric（点击进来的那个）+ project/group + date range
 */
export interface DrawerOpenPayload {
  /** 点击进来的指标作默认 selectedKey */
  metric: DrawerMetric;
  /** undefined = Section 1 全业务（不分项目） */
  project?: ProjectKey;
  /** undefined / "all" = 项目内总 */
  group?: GroupKey;
  date_from: string;
  date_to: string;
}

interface DashboardDrawerProps {
  payload: DrawerOpenPayload | null;
  onClose: () => void;
}

const GROUP_LABEL: Record<GroupKey, string> = {
  all: "总",
  online: "线上",
  offline: "线下",
  other: "其他",
};

function buildBreadcrumb(p: DrawerOpenPayload): string {
  if (!p.project) return "核心数据 / 全业务";
  const groupLabel = !p.group || p.group === "all" ? "总" : GROUP_LABEL[p.group];
  return `业务细分 / ${PROJECT_LABELS[p.project]} / ${groupLabel}`;
}

/** 单位推断：人 / h / 中文缩写 */
function formatKpiValue(value: number, unit?: string): { body: string; suffix: string } {
  if (unit === "人") {
    return { body: value.toLocaleString("zh-CN"), suffix: "人" };
  }
  if (unit === "h") {
    return { body: value.toFixed(1), suffix: "h" };
  }
  // 数字类：用中文缩写（万/亿）
  const abs = Math.abs(value);
  if (abs >= 100_000_000) {
    return { body: (value / 100_000_000).toFixed(2).replace(/\.?0+$/, ""), suffix: "亿" };
  }
  if (abs >= 1_000_000) {
    return { body: (value / 10_000).toFixed(2).replace(/\.?0+$/, ""), suffix: "万" };
  }
  return { body: value.toLocaleString("zh-CN"), suffix: "" };
}

function formatVsPrev(vs: number | null): { text: string; kind: "up" | "down" | "flat" | "none" } {
  if (vs === null) return { text: "—", kind: "none" };
  if (Math.abs(vs) < 0.01) return { text: "持平", kind: "flat" };
  const arrow = vs > 0 ? "↑" : "↓";
  const abs = Math.abs(vs);
  const display = abs >= 10 ? abs.toFixed(0) : abs.toFixed(1);
  return { text: `${arrow}${display}%`, kind: vs > 0 ? "up" : "down" };
}

/** 把数值格式化用于 Y 轴 / Tooltip / 表格 cell */
function formatMetricValue(value: number | null | undefined, unit?: string): string {
  if (value === null || value === undefined) return "—";
  if (unit === "人") return value.toLocaleString("zh-CN");
  if (unit === "h") return `${value.toFixed(1)}h`;
  return formatChineseNumber(value);
}

/* ──────────────────── KPI Card ──────────────────── */

function KpiCard({
  kpi,
  selected,
  onClick,
}: {
  kpi: DrawerKpiBlock;
  selected: boolean;
  onClick: () => void;
}): React.JSX.Element {
  const notApplicable = kpi.not_applicable === true;
  const { body, suffix } = formatKpiValue(kpi.value, kpi.unit);
  const vs = formatVsPrev(kpi.vs_prev);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={notApplicable}
      className={cn(
        "rounded-md border bg-card p-3 text-left transition-all",
        "hover:border-foreground/15",
        selected && !notApplicable
          ? "border-[var(--selection-border)] bg-[var(--selection-bg)] ring-2 ring-[var(--selection-ring)]"
          : "",
        notApplicable && "opacity-50 cursor-not-allowed",
      )}
    >
      <div className="text-muted-foreground text-[11px] truncate">{kpi.label}</div>
      {notApplicable ? (
        <div className="text-foreground/40 mt-1 text-[20px] font-bold tabular-nums">—</div>
      ) : (
        <div
          className={cn(
            "mt-0.5 text-[20px] leading-tight font-bold tabular-nums tracking-tight",
            selected ? "text-[var(--selection-primary)]" : "text-foreground",
          )}
        >
          {body}
          {suffix ? (
            <span
              className={cn(
                "text-[12px] font-medium ml-0.5",
                selected ? "text-[var(--selection-primary)]" : "text-muted-foreground",
              )}
            >
              {suffix}
            </span>
          ) : null}
        </div>
      )}
      <div className="text-muted-foreground mt-1 text-[10px]">
        {notApplicable ? (
          "不适用"
        ) : (
          <>
            较前周期{" "}
            <span
              className={cn(
                "font-medium",
                vs.kind === "up" && "text-[var(--change-up)]",
                vs.kind === "down" && "text-[var(--change-down)]",
              )}
            >
              {vs.text}
            </span>
          </>
        )}
      </div>
    </button>
  );
}

/* ──────────────────── 主曲线 ──────────────────── */

type TrendGran = "day" | "week" | "month";

/** 把日明细按粒度聚合（前端求和，不去重）。日：原样；周：归 ISO 周一；月：按 YYYY-MM */
function aggregateTrend(
  rows: DrawerDailyRow[],
  key: DrawerMetric,
  gran: TrendGran,
): { label: string; value: number | null }[] {
  if (gran === "day") {
    return rows.map((r) => ({
      label: r.date.slice(5),
      value: typeof r.values[key] === "number" ? (r.values[key] as number) : null,
    }));
  }
  const map = new Map<string, { label: string; sum: number; has: boolean }>();
  for (const r of rows) {
    let bucketKey: string;
    let label: string;
    if (gran === "month") {
      bucketKey = r.date.slice(0, 7); // YYYY-MM
      label = bucketKey;
    } else {
      const d = new Date(r.date + "T00:00:00Z");
      const dow = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() - dow + 1); // 归到本周一
      bucketKey = d.toISOString().slice(0, 10);
      label = bucketKey.slice(5); // MM-DD（周一）
    }
    let g = map.get(bucketKey);
    if (!g) {
      g = { label, sum: 0, has: false };
      map.set(bucketKey, g);
    }
    const v = r.values[key];
    if (typeof v === "number") {
      g.sum += v;
      g.has = true;
    }
  }
  return Array.from(map.values()).map((g) => ({ label: g.label, value: g.has ? g.sum : null }));
}

function TrendChart({
  selectedKpi,
  curRows,
  prevRows,
  loading,
}: {
  selectedKpi: DrawerKpiBlock;
  curRows: DrawerDailyRow[];
  prevRows: DrawerDailyRow[];
  loading: boolean;
}): React.JSX.Element {
  const [gran, setGran] = useState<TrendGran>("day");
  if (loading) return <Skeleton className="h-[260px] w-full rounded-md" />;
  if (selectedKpi.not_applicable) {
    return (
      <div className="text-muted-foreground flex h-[240px] items-center justify-center text-sm">
        当前指标不适用 — 不展示趋势
      </div>
    );
  }

  const key = selectedKpi.key;
  const unit = selectedKpi.unit;

  const curAgg = aggregateTrend(curRows, key, gran);
  const prevAgg = aggregateTrend(prevRows, key, gran);
  const data = curAgg.map((c, i) => ({
    date: c.label,
    cur: c.value,
    cmp: prevAgg[i]?.value ?? null,
  }));

  return (
    <div>
      <div className="mb-2 flex gap-1">
        {(["day", "week", "month"] as const).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGran(g)}
            className={`rounded px-2.5 py-0.5 text-[11.5px] transition ${
              gran === g
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-slate-100"
            }`}
          >
            {g === "day" ? "日" : g === "week" ? "周" : "月"}
          </button>
        ))}
      </div>
      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="dashboard-cur-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-current)" stopOpacity={0.18} />
                <stop offset="100%" stopColor="var(--chart-current)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--chart-grid)" }}
              minTickGap={20}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v) => formatMetricValue(v, unit)}
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
                typeof value === "number" ? formatMetricValue(value, unit) : "—",
                name === "cur" ? "本周期" : "前同期",
              ]}
            />
            <Area
              type="monotone"
              dataKey="cur"
              stroke="var(--chart-current)"
              strokeWidth={2}
              fill="url(#dashboard-cur-area)"
              dot={false}
              activeDot={{ r: 4, fill: "var(--chart-current)" }}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="cmp"
              stroke="var(--chart-compare)"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ──────────────────── 日明细表 + CSV 下载 ──────────────────── */

function DailyTable({
  kpis,
  rows,
  loading,
}: {
  kpis: DrawerKpiBlock[];
  rows: DrawerDailyRow[];
  loading: boolean;
}): React.JSX.Element {
  if (loading) {
    return <Skeleton className="h-48 w-full rounded" />;
  }
  return (
    <div className="-mx-4 -mb-4 overflow-x-auto">
      <table className="w-full text-xs tabular-nums">
        <thead className="sticky top-0">
          <tr className="bg-muted/50 text-muted-foreground">
            <th className="bg-muted/50 sticky left-0 z-1 px-3 py-2 text-left font-medium">日期</th>
            {kpis.map((k) => (
              <th key={k.key} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                {k.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={kpis.length + 1} className="text-muted-foreground py-8 text-center">
                无数据
              </td>
            </tr>
          ) : (
            rows
              .slice()
              .reverse()
              .map((r) => (
                <tr key={r.date} className="hover:bg-accent/30 border-t">
                  <td className="bg-card text-muted-foreground sticky left-0 z-1 px-3 py-2 text-left whitespace-nowrap">
                    {r.date.slice(5)}
                  </td>
                  {kpis.map((k) => {
                    const v = r.values[k.key];
                    return (
                      <td key={k.key} className="px-3 py-2 text-right whitespace-nowrap">
                        {k.not_applicable
                          ? "—"
                          : typeof v === "number"
                            ? formatMetricValue(v, k.unit)
                            : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** 生成 CSV 内容并触发下载 */
function downloadCsv(payload: DrawerOpenPayload, data: DrawerDetailResponse): void {
  const projectSeg = payload.project ?? "all";
  const groupSeg = payload.group ?? "all";
  const fileName = `dashboard-${projectSeg}-${groupSeg}-${payload.date_from}-${payload.date_to}.csv`;

  const headerRow = ["日期", ...data.kpis.map((k) => k.label)];
  const dataRows = data.daily_rows.map((r) => [
    r.date,
    ...data.kpis.map((k) => {
      if (k.not_applicable) return "";
      const v = r.values[k.key];
      return typeof v === "number" ? String(v) : "";
    }),
  ]);

  // Excel 兼容 BOM
  const bom = "﻿";
  const lines = [headerRow, ...dataRows].map((row) =>
    row
      .map((cell) => {
        const s = String(cell);
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      })
      .join(","),
  );
  const csv = bom + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ──────────────────── 达成主播列表 ──────────────────── */

/**
 * 把 metric_value 按 selectedKpi 的口径格式化为显示文本。
 *
 * - first_live_anchor_count / new_anchor_count → 用 display_date（"YYYY-MM-DD"）
 * - active_anchor_count → "X 天"
 * - 其他（音浪 / 各类流水 / 安装·激活 / 曝光·UV）→ formatMetricValue + unit
 */
function formatTopAnchorValue(
  anchor: DrawerTopAnchor,
  selectedKpi: DrawerKpiBlock,
): { primary: string; suffix: string } {
  if (selectedKpi.key === "first_live_anchor_count" || selectedKpi.key === "new_anchor_count") {
    return { primary: anchor.display_date ?? "—", suffix: "" };
  }
  if (selectedKpi.key === "active_anchor_count") {
    return { primary: anchor.metric_value.toString(), suffix: "天" };
  }
  if (selectedKpi.unit === "人") {
    return { primary: anchor.metric_value.toLocaleString("zh-CN"), suffix: "人" };
  }
  // 音浪 / 流水：中文缩写
  return { primary: formatChineseNumber(anchor.metric_value), suffix: "" };
}

function valueColumnLabel(selectedKpi: DrawerKpiBlock): string {
  if (selectedKpi.key === "first_live_anchor_count") return "首播日期";
  if (selectedKpi.key === "new_anchor_count") return "入会日期";
  if (selectedKpi.key === "active_anchor_count") return "开播天数";
  return selectedKpi.label;
}

function TopAnchorsList({
  selectedKpi,
  rows,
  total,
  loading,
  onClickRow,
  onClickViewAll,
}: {
  selectedKpi: DrawerKpiBlock;
  rows: DrawerTopAnchor[];
  total: number;
  loading: boolean;
  onClickRow: (anchor: DrawerTopAnchor) => void;
  onClickViewAll: () => void;
}): React.JSX.Element {
  if (loading && rows.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded" />
        ))}
      </div>
    );
  }
  if (selectedKpi.not_applicable) {
    return <div className="text-muted-foreground py-6 text-center text-sm">当前指标不适用</div>;
  }
  if (rows.length === 0) {
    return <div className="text-muted-foreground py-6 text-center text-sm">无达成主播</div>;
  }

  const valueLabel = valueColumnLabel(selectedKpi);

  return (
    <>
      <div className="overflow-hidden rounded-md border">
        {/* 表头 */}
        <div className="bg-muted/50 text-muted-foreground grid grid-cols-[40px_minmax(0,1fr)_120px_140px] items-center px-3 py-2 text-[11px] font-medium">
          <span>#</span>
          <span>主播</span>
          <span>经纪人</span>
          <span className="text-right">{valueLabel}</span>
        </div>
        {/* 表体 */}
        <div className="divide-y">
          {rows.map((anchor, idx) => {
            const { primary, suffix } = formatTopAnchorValue(anchor, selectedKpi);
            const initial = (anchor.nick_name || "?").slice(0, 1);
            return (
              <button
                key={anchor.anchor_id}
                type="button"
                onClick={() => onClickRow(anchor)}
                className="hover:bg-accent/40 grid w-full grid-cols-[40px_minmax(0,1fr)_120px_140px] items-center px-3 py-2 text-left transition-colors"
              >
                <span className="text-muted-foreground text-[11px] tabular-nums">{idx + 1}</span>
                <div className="flex min-w-0 items-center gap-2">
                  {anchor.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={anchor.avatar}
                      alt={anchor.nick_name}
                      className="size-7 shrink-0 rounded-full bg-muted object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium">
                      {initial}
                    </div>
                  )}
                  <div className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-xs font-medium" title={anchor.nick_name}>
                      {anchor.nick_name || "—"}
                    </span>
                    {anchor.aweme_display_id && (
                      <span className="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1 text-[10px]">
                        <Music2 className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{anchor.aweme_display_id}</span>
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-muted-foreground truncate text-xs">
                  {anchor.broker_name ?? "—"}
                </span>
                <span className="text-foreground text-right text-xs font-medium tabular-nums">
                  {primary}
                  {suffix && (
                    <span className="text-muted-foreground ml-0.5 text-[10px] font-normal">
                      {suffix}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {/* 底部「查看全部」 */}
      {total > rows.length && (
        <button
          type="button"
          onClick={onClickViewAll}
          className="text-primary hover:bg-primary/5 mt-2 inline-flex w-full items-center justify-center gap-1 rounded-md border border-dashed py-2 text-xs font-medium transition-colors"
        >
          查看全部 {total} 个
          <ChevronRight className="h-3 w-3" />
        </button>
      )}
    </>
  );
}

/* ──────────────────── SectionBlock helper ──────────────────── */

function SectionBlock({
  label,
  hint,
  rightSlot,
  children,
}: {
  label: string;
  hint?: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="bg-card mb-4 rounded-lg border p-4 last:mb-0">
      <div className="mb-3 flex items-center gap-2">
        <span className="bg-primary block h-3 w-[3px] rounded" />
        <span className="text-foreground/80 text-xs font-medium tracking-wide">{label}</span>
        {hint && <span className="text-muted-foreground ml-auto text-xs">{hint}</span>}
        {rightSlot ? <div className="ml-auto">{rightSlot}</div> : null}
      </div>
      {children}
    </section>
  );
}

/* ──────────────────── 主组件 ──────────────────── */

export function DashboardDrawer(props: DashboardDrawerProps): React.JSX.Element | null {
  // A new context starts with its clicked metric. Resetting it in an effect used
  // to dispatch a second request after the initial request had already started.
  return props.payload ? (
    <OpenDashboardDrawer key={JSON.stringify(props.payload)} {...props} />
  ) : null;
}

function OpenDashboardDrawer({ payload, onClose }: DashboardDrawerProps): React.JSX.Element {
  const router = useRouter();
  const [data, setData] = useState<DrawerDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [topLoading, setTopLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<DrawerMetric | null>(payload?.metric ?? null);

  const open = payload !== null;
  const breadcrumb = useMemo(() => (payload ? buildBreadcrumb(payload) : ""), [payload]);

  // 首次打开只加载一次完整抽屉数据。指标切换由下面的轻量请求单独更新排行，
  // 避免重复查询当前/前周期的全部 10 项日明细。
  useEffect(() => {
    if (!payload) {
      setData(null);
      return;
    }
    let cancelled = false;
    const ctl = new AbortController();
    setLoading(true);
    setError(null);
    // 不 setData(null) — 切换 metric 时让旧数据继续展示，等新数据来了再换

    const params = new URLSearchParams({
      date_from: payload.date_from,
      date_to: payload.date_to,
    });
    if (payload.project) params.set("project", payload.project);
    if (payload.group && payload.group !== "all") params.set("group", payload.group);
    params.set("metric", payload.metric);

    fetch(`/api/dashboard/detail?${params.toString()}`, { signal: ctl.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<DrawerDetailResponse>;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      ctl.abort();
    };
  }, [payload?.project, payload?.group, payload?.date_from, payload?.date_to, payload]);

  useEffect(() => {
    if (!payload || !data || !selectedKey || selectedKey === payload.metric) return;
    let cancelled = false;
    const ctl = new AbortController();
    setTopLoading(true);
    const params = new URLSearchParams({
      date_from: payload.date_from,
      date_to: payload.date_to,
      metric: selectedKey,
      only: "top",
    });
    if (payload.project) params.set("project", payload.project);
    if (payload.group && payload.group !== "all") params.set("group", payload.group);
    fetch(`/api/dashboard/detail?${params.toString()}`, { signal: ctl.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<Pick<DrawerDetailResponse, "top_anchors" | "total_anchors">>;
      })
      .then((json) => {
        if (cancelled) return;
        setData((current) => (current ? { ...current, ...json } : current));
      })
      .catch((e: unknown) => {
        if (cancelled || (e instanceof DOMException && e.name === "AbortError")) return;
        setError(e instanceof Error ? e.message : "加载失败");
      })
      .finally(() => {
        if (!cancelled) setTopLoading(false);
      });
    return () => {
      cancelled = true;
      ctl.abort();
    };
    // data is intentionally omitted: adding it would repeat the same top-only request
    // after the response updates the shared drawer state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, selectedKey]);

  // 选中的 KPI（用于驱动主曲线）
  const selectedKpi: DrawerKpiBlock | null = useMemo(() => {
    if (!data) return null;
    const k = selectedKey ?? payload?.metric ?? data.kpis[0]?.key;
    return data.kpis.find((kk) => kk.key === k) ?? data.kpis[0] ?? null;
  }, [data, selectedKey, payload]);

  // 周期天数
  const periodDays = useMemo(() => {
    if (!payload) return 0;
    const ms = Date.parse(payload.date_to) - Date.parse(payload.date_from);
    return Math.round(ms / 86_400_000) + 1;
  }, [payload]);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[1024px] !max-w-[90vw] gap-0 p-0 sm:max-w-none">
        <SheetTitle className="sr-only">{data?.title ?? "详情"}</SheetTitle>
        <SheetDescription className="sr-only">
          {payload?.date_from} 至 {payload?.date_to} 的全 9 维度数据
        </SheetDescription>

        {payload && (
          <div className="flex h-full flex-col overflow-hidden">
            {/* Header */}
            <div className="bg-card border-b px-7 pt-5 pb-4">
              <div className="text-muted-foreground mb-1.5 text-xs">{breadcrumb}</div>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-foreground truncate text-lg font-semibold">
                  {data?.title ?? "加载中…"}
                </h3>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="关闭"
                  className="text-muted-foreground hover:text-foreground hover:bg-muted flex size-8 flex-shrink-0 items-center justify-center rounded-md text-2xl leading-none"
                >
                  ×
                </button>
              </div>
              <div className="text-muted-foreground mt-2 flex items-center gap-2 text-xs">
                <span>📅</span>
                <span className="text-foreground/80">
                  {payload.date_from} ~ {payload.date_to}
                </span>
                <span className="ml-1">· 共 {periodDays} 天</span>
              </div>
            </div>

            {/* Body */}
            <div className="bg-background flex-1 overflow-y-auto px-7 py-5">
              {error ? (
                <div className="border-destructive/30 bg-destructive/5 text-destructive mb-4 rounded-lg border p-4 text-sm">
                  数据加载失败：{error}
                </div>
              ) : null}

              {/* 9 KPI 卡（点击切换主曲线） */}
              <SectionBlock label="全维度指标" hint="点击任一卡片切换上方主曲线">
                {loading || !data ? (
                  <div className="grid grid-cols-3 gap-2.5 lg:grid-cols-5">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div key={i} className="bg-card rounded-md border p-3">
                        <Skeleton className="mb-1.5 h-3 w-12" />
                        <Skeleton className="mb-1 h-5 w-16" />
                        <Skeleton className="h-2.5 w-20" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    {/* Section 1：5 核心 KPI */}
                    <div className="text-muted-foreground mb-2 text-[11px]">核心 KPI</div>
                    <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                      {data.kpis.slice(0, 5).map((k) => (
                        <KpiCard
                          key={k.key}
                          kpi={k}
                          selected={selectedKpi?.key === k.key}
                          onClick={() => setSelectedKey(k.key)}
                        />
                      ))}
                    </div>
                    {/* Section 2：5 业务细分 KPI */}
                    <div className="text-muted-foreground mb-2 text-[11px]">业务细分</div>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
                      {data.kpis.slice(5).map((k) => (
                        <KpiCard
                          key={k.key}
                          kpi={k}
                          selected={selectedKpi?.key === k.key}
                          onClick={() => setSelectedKey(k.key)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </SectionBlock>

              {/* 主曲线 */}
              {selectedKpi && (
                <SectionBlock label={`趋势 · ${selectedKpi.label}`} hint="虚线为前一周期同期对比">
                  <TrendChart
                    selectedKpi={selectedKpi}
                    curRows={data?.daily_rows ?? []}
                    prevRows={data?.prev_daily_rows ?? []}
                    loading={loading}
                  />
                  <div className="text-muted-foreground mt-2 flex gap-4 text-xs">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="bg-primary inline-block h-[2px] w-3.5" />
                      本周期
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block h-0 w-3.5"
                        style={{
                          borderTop: "2px dashed var(--chart-compare)",
                        }}
                      />
                      前 {periodDays} 日同期
                    </span>
                  </div>
                </SectionBlock>
              )}

              {/* 达成主播列表 */}
              {selectedKpi && (
                <SectionBlock
                  label={`达成主播 · 按 ${selectedKpi.label} 排序`}
                  hint={
                    selectedKpi.key === "first_live_anchor_count" ||
                    selectedKpi.key === "new_anchor_count"
                      ? "全部展示"
                      : "Top 20"
                  }
                >
                  <TopAnchorsList
                    selectedKpi={selectedKpi}
                    rows={data?.top_anchors ?? []}
                    total={data?.total_anchors ?? 0}
                    loading={loading || topLoading}
                    onClickRow={(anchor) => {
                      // 关闭抽屉后跳转，带上当前抽屉的日期范围 + 项目
                      onClose();
                      const sp = new URLSearchParams();
                      sp.set("anchor_id", anchor.anchor_id);
                      sp.set("date_from", payload.date_from);
                      sp.set("date_to", payload.date_to);
                      if (payload.project) sp.set("project", payload.project);
                      router.push(`/anchors?${sp.toString()}`);
                    }}
                    onClickViewAll={() => {
                      onClose();
                      const sp = new URLSearchParams();
                      sp.set("date_from", payload.date_from);
                      sp.set("date_to", payload.date_to);
                      if (payload.project) sp.set("project", payload.project);
                      if (payload.group && payload.group !== "all") {
                        sp.set("group", payload.group);
                      }
                      router.push(`/anchors?${sp.toString()}`);
                    }}
                  />
                </SectionBlock>
              )}

              {/* 日明细表 + 导出 CSV */}
              <SectionBlock
                label={`日明细 · 全部 ${data?.kpis.length ?? 9} 项指标`}
                rightSlot={
                  <button
                    type="button"
                    onClick={() => data && downloadCsv(payload, data)}
                    disabled={!data || loading}
                    className={cn(
                      "inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors",
                      "border-primary/30 text-primary hover:bg-primary/5",
                      (!data || loading) && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    导出 CSV
                  </button>
                }
              >
                <DailyTable
                  kpis={data?.kpis ?? []}
                  rows={data?.daily_rows ?? []}
                  loading={loading}
                />
              </SectionBlock>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
