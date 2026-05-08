"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Settings2,
} from "lucide-react";
import { KpiGrid, type KpiItem } from "@/components/patterns/kpi-grid";
import { DataToolbar } from "@/components/patterns/data-toolbar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PresetChip, PresetToolbar } from "@/components/patterns/preset-toolbar";
import { cn } from "@/lib/utils/cn";
import { KuaishouAnchorDetailDrawer } from "./kuaishou-anchor-detail-drawer";
import { ColumnCustomizer } from "./column-customizer";
import {
  KS_COLUMNS,
  KS_GROUPS,
  getKsColumnsByGroup,
  getKsColumnsBySubGroup,
  KS_DEFAULT_VISIBLE,
  type KuaishouColKey,
} from "./kuaishou-column-presets";

interface Row {
  id: string;
  account_name: string;
  platform_account_id: string | null;
  avatar: string | null;
  product: string;
  agent_dingtalk_user_id: string | null;
  agent_name: string | null;
  fans_count: number | null;
  joined_at: string | null;
  contract_expire_at: string | null;
  renewal_status: string | null;
  broker_name_raw: string | null;
  live_status: string;
  // 直播表现 - 基础聚合
  session_count: number;
  total_amt: number;
  avg_acu: number;
  max_peak: number;
  total_add_fans: number;
  total_duration_h: number;
  // 流量
  total_play_uv: number;
  total_play_user_cnt: number;
  avg_play_rate: number;
  avg_per_play_time_min: number;
  // 涨粉
  total_follow_author: number;
  total_cancel_follow: number;
  avg_transfer_fans_rate: number;
  // 互动
  total_like_cnt: number;
  total_comment_cnt: number;
  total_share_cnt: number;
  avg_like_rate: number;
  avg_comment_rate: number;
  // 送礼
  total_send_gift_uv: number;
  total_sent_gift_cnt: number;
  // 违规
  total_report_num: number;
}

interface KpiResp {
  total: number;
  withAgent: number;
  contractExpiringIn90Days: number;
  renewalPending: number;
  totalSessions: number;
  totalAmt: number;
  totalAddFans: number;
  prevTotalSessions: number;
  prevTotalAmt: number;
  prevTotalAddFans: number;
}

const PRODUCT_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "捕鱼大作战", label: "捕鱼大作战" },
  { value: "途游休闲捕鱼", label: "途游休闲捕鱼" },
  { value: "电玩捕鱼", label: "电玩捕鱼" },
  { value: "未分类", label: "未分类" },
];

const DAYS_PRESETS = [
  { days: 1, label: "昨日" },
  { days: 7, label: "近 7 日" },
  { days: 30, label: "近 30 日" },
];

function todayCST(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}
function daysAgoCST(n: number): string {
  return new Date(Date.now() - (n - 1) * 86400_000 + 8 * 3600_000).toISOString().slice(0, 10);
}
function presetRange(days: number): { from: string; to: string } {
  if (days === 1) {
    const y = daysAgoCST(2); // 昨日
    return { from: y, to: y };
  }
  return { from: daysAgoCST(days), to: todayCST() };
}
function matchPreset(from: string, to: string): number | null {
  for (const p of DAYS_PRESETS) {
    const r = presetRange(p.days);
    if (r.from === from && r.to === to) return p.days;
  }
  return null;
}

type SortKey =
  | "account_name"
  | "product"
  | "agent_name"
  | "fans_count"
  | "joined_at"
  | "contract_expire_at"
  | "live_status"
  | "session_count"
  | "total_amt"
  | "avg_acu"
  | "max_peak"
  | "total_add_fans"
  | "total_duration_h"
  | "total_play_uv"
  | "total_play_user_cnt"
  | "avg_play_rate"
  | "avg_per_play_time_min"
  | "total_follow_author"
  | "total_cancel_follow"
  | "avg_transfer_fans_rate"
  | "total_like_cnt"
  | "total_comment_cnt"
  | "total_share_cnt"
  | "avg_like_rate"
  | "avg_comment_rate"
  | "total_send_gift_uv"
  | "total_sent_gift_cnt"
  | "total_report_num";
type SortDir = "asc" | "desc";

const PAGE_SIZES = [50, 100, 200] as const;
type PageSize = (typeof PAGE_SIZES)[number];

interface ColDef {
  key: SortKey;
  label: string;
  group: "基础" | "公会" | "直播表现" | "流量" | "涨粉" | "互动" | "送礼" | "违规";
  align?: "left" | "right";
  sticky?: boolean;
  width?: string;
  defaultVisible: boolean;
}

const COLUMNS: ColDef[] = [
  {
    key: "account_name",
    label: "主播",
    group: "基础",
    sticky: true,
    width: "260px",
    defaultVisible: true,
  },
  { key: "product", label: "项目", group: "基础", defaultVisible: true },
  { key: "agent_name", label: "经纪人", group: "基础", defaultVisible: true },
  { key: "live_status", label: "状态", group: "基础", defaultVisible: true },

  { key: "fans_count", label: "粉丝数", group: "公会", align: "right", defaultVisible: true },
  { key: "joined_at", label: "入驻时间", group: "公会", defaultVisible: false },
  { key: "contract_expire_at", label: "合约到期", group: "公会", defaultVisible: true },

  { key: "session_count", label: "场次", group: "直播表现", align: "right", defaultVisible: true },
  { key: "total_amt", label: "流水", group: "直播表现", align: "right", defaultVisible: true },
  { key: "avg_acu", label: "平均ACU", group: "直播表现", align: "right", defaultVisible: true },
  {
    key: "total_duration_h",
    label: "总直播时长",
    group: "直播表现",
    align: "right",
    defaultVisible: false,
  },

  // 流量
  {
    key: "total_play_uv",
    label: "有效观看人数",
    group: "流量",
    align: "right",
    defaultVisible: false,
  },
  { key: "max_peak", label: "峰值在线", group: "流量", align: "right", defaultVisible: false },
  {
    key: "total_play_user_cnt",
    label: "总观看次数",
    group: "流量",
    align: "right",
    defaultVisible: false,
  },
  {
    key: "avg_play_rate",
    label: "平均观看率",
    group: "流量",
    align: "right",
    defaultVisible: false,
  },
  {
    key: "avg_per_play_time_min",
    label: "平均观看时长",
    group: "流量",
    align: "right",
    defaultVisible: false,
  },

  // 涨粉
  { key: "total_add_fans", label: "净涨粉", group: "涨粉", align: "right", defaultVisible: false },
  {
    key: "total_follow_author",
    label: "直播关注",
    group: "涨粉",
    align: "right",
    defaultVisible: false,
  },
  {
    key: "total_cancel_follow",
    label: "直播取关",
    group: "涨粉",
    align: "right",
    defaultVisible: false,
  },
  {
    key: "avg_transfer_fans_rate",
    label: "平均转粉率",
    group: "涨粉",
    align: "right",
    defaultVisible: false,
  },

  // 互动
  { key: "total_like_cnt", label: "点赞", group: "互动", align: "right", defaultVisible: false },
  { key: "avg_like_rate", label: "点赞率", group: "互动", align: "right", defaultVisible: false },
  { key: "total_comment_cnt", label: "评论", group: "互动", align: "right", defaultVisible: false },
  {
    key: "avg_comment_rate",
    label: "评论率",
    group: "互动",
    align: "right",
    defaultVisible: false,
  },
  { key: "total_share_cnt", label: "分享", group: "互动", align: "right", defaultVisible: false },

  // 送礼
  {
    key: "total_send_gift_uv",
    label: "送礼人数",
    group: "送礼",
    align: "right",
    defaultVisible: false,
  },
  {
    key: "total_sent_gift_cnt",
    label: "送礼次数",
    group: "送礼",
    align: "right",
    defaultVisible: false,
  },

  // 违规
  {
    key: "total_report_num",
    label: "举报次数",
    group: "违规",
    align: "right",
    defaultVisible: false,
  },
];

const STORAGE_KEY = "qjhy:kuaishou-anchor-list-cols";

function loadCols(): Set<SortKey> {
  if (typeof window === "undefined") {
    return new Set(COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw) as SortKey[]);
  } catch {
    /* fall through */
  }
  return new Set(COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));
}
function saveCols(set: Set<SortKey>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

function exportCsv(rows: Row[], cols: ColDef[]): void {
  const get = (r: Row, k: SortKey): string => {
    const v = (r as unknown as Record<string, unknown>)[k];
    if (v == null) return "";
    if (typeof v === "number") return String(v);
    return String(v);
  };
  const header = cols.map((c) => c.label).join(",");
  const lines = rows.map((r) =>
    cols.map((c) => `"${get(r, c.key).replace(/"/g, '""')}"`).join(","),
  );
  const csv = "﻿" + header + "\n" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kuaishou-anchors-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtChinese(n: number): string {
  if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2).replace(/\.?0+$/, "") + "亿";
  if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(2).replace(/\.?0+$/, "") + "万";
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}
function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1e4) return "¥" + (n / 1e4).toFixed(2).replace(/\.?0+$/, "") + "万";
  return "¥" + n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function DeltaPill({ cur, prev }: { cur: number; prev: number }): React.JSX.Element | null {
  if (prev === 0 && cur === 0) return null;
  if (prev === 0) {
    return <span className="text-muted-foreground/70">较前期 —</span>;
  }
  const delta = ((cur - prev) / prev) * 100;
  if (Math.abs(delta) < 0.5) {
    return <span className="text-muted-foreground/70">— 持平</span>;
  }
  const up = delta > 0;
  return (
    <span className={cn(up ? "text-[var(--change-up)]" : "text-[var(--change-down)]")}>
      {up ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

export function KuaishouAnchorTable(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL 初始值（mount 时只读一次）
  const initialFrom = searchParams.get("date_from");
  const initialTo = searchParams.get("date_to");
  const initialProduct = searchParams.get("product") ?? "all";
  const initialSearch = searchParams.get("search") ?? "";
  const defaultRange = presetRange(7);

  const [product, setProduct] = useState<string>(initialProduct);
  const [search, setSearch] = useState<string>(initialSearch);
  const [dateFrom, setDateFrom] = useState<string>(initialFrom ?? defaultRange.from);
  const [dateTo, setDateTo] = useState<string>(initialTo ?? defaultRange.to);
  const [rows, setRows] = useState<Row[]>([]);
  const [kpi, setKpi] = useState<KpiResp>({
    total: 0,
    withAgent: 0,
    contractExpiringIn90Days: 0,
    renewalPending: 0,
    totalSessions: 0,
    totalAmt: 0,
    totalAddFans: 0,
    prevTotalSessions: 0,
    prevTotalAmt: 0,
    prevTotalAddFans: 0,
  });
  const [loading, setLoading] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>("total_amt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [visibleCols, setVisibleCols] = useState<Set<SortKey>>(() => loadCols());
  const [colPicker, setColPicker] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);

  const [selectedAnchor, setSelectedAnchor] = useState<Row | null>(null);
  const [showCompare, setShowCompare] = useState(true);
  const [dataSource, setDataSource] = useState<"all" | "today" | "history">(
    (searchParams.get("data_source") as "all" | "today" | "history") ?? "all",
  );

  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // 列勾选 popover 外点关闭
  useEffect(() => {
    if (!colPicker) return;
    const h = (e: MouseEvent) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node))
        setColPicker(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [colPicker]);

  // 加载数据 + 同步 URL
  useEffect(() => {
    setLoading(true);
    let cancelled = false;
    const sp = new URLSearchParams();
    sp.set("platform", "kuaishou");
    sp.set("date_from", dateFrom);
    sp.set("date_to", dateTo);
    if (product !== "all") sp.set("product", product);
    if (debouncedSearch) sp.set("search", debouncedSearch);
    if (dataSource !== "all") sp.set("data_source", dataSource);
    // 写回 URL（不刷新页面）
    if (typeof window !== "undefined") {
      router.replace(`/anchors?${sp.toString()}`, { scroll: false });
    }
    // API 请求用同样参数
    const apiSp = new URLSearchParams();
    apiSp.set("date_from", dateFrom);
    apiSp.set("date_to", dateTo);
    apiSp.set("product", product);
    apiSp.set("data_source", dataSource);
    if (debouncedSearch) apiSp.set("search", debouncedSearch);
    (async () => {
      try {
        const r = await fetch(`/api/anchors-kuaishou?${apiSp.toString()}`);
        if (!r.ok) {
          if (r.status === 401) toast.error("登录已失效");
          else if (r.status === 403) toast.error("无权访问主播明细");
          else toast.error(`加载失败 (${r.status})`);
          if (!cancelled) {
            setRows([]);
          }
          return;
        }
        const d = (await r.json()) as { rows: Row[]; kpi: KpiResp };
        if (cancelled) return;
        setRows(d.rows);
        setKpi(d.kpi);
        setPage(1);
      } catch (e) {
        if (cancelled) return;
        toast.error("网络错误：" + (e instanceof Error ? e.message : "未知"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [product, debouncedSearch, dateFrom, dateTo, router, dataSource]);

  useEffect(() => {
    setPage(1);
  }, [sortKey, sortDir, pageSize]);

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = pickSortValue(a, sortKey);
      const bv = pickSortValue(b, sortKey);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp =
        typeof av === "number" ? av - (bv as number) : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  function toggleSort(key: SortKey): void {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      const stringSort =
        key === "account_name" ||
        key === "product" ||
        key === "agent_name" ||
        key === "joined_at" ||
        key === "contract_expire_at";
      setSortDir(stringSort ? "asc" : "desc");
    }
  }

  const cols = useMemo(() => COLUMNS.filter((c) => visibleCols.has(c.key)), [visibleCols]);

  const kpiItems: KpiItem[] = useMemo(() => {
    return [
      { key: "total", label: "账号总数", value: kpi.total.toLocaleString() },
      { key: "withAgent", label: "已分配经纪人", value: kpi.withAgent.toLocaleString() },
      {
        key: "totalSessions",
        label: "本期场次",
        value: kpi.totalSessions.toLocaleString(),
        footer: <DeltaPill cur={kpi.totalSessions} prev={kpi.prevTotalSessions} />,
      },
      {
        key: "totalAmt",
        label: "本期流水",
        value: fmtMoney(kpi.totalAmt),
        footer: <DeltaPill cur={kpi.totalAmt} prev={kpi.prevTotalAmt} />,
      },
      {
        key: "totalAddFans",
        label: "本期涨粉",
        value: fmtChinese(kpi.totalAddFans),
        footer: <DeltaPill cur={kpi.totalAddFans} prev={kpi.prevTotalAddFans} />,
      },
      {
        key: "expiring",
        label: "合约 90 天内到期",
        value: kpi.contractExpiringIn90Days.toLocaleString(),
      },
    ];
  }, [kpi]);

  return (
    <div className="space-y-3">
      <DataToolbar
        filters={
          <div className="flex min-w-0 items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              max={dateTo}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-8 w-[140px] shrink-0 rounded border border-transparent bg-transparent px-2 text-sm hover:border-slate-200 focus:border-primary focus:bg-white focus:outline-none"
            />
            <span className="text-muted-foreground shrink-0">~</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              max={todayCST()}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-8 w-[140px] shrink-0 rounded border border-transparent bg-transparent px-2 text-sm hover:border-slate-200 focus:border-primary focus:bg-white focus:outline-none"
            />
            <div className="flex shrink-0 gap-1">
              {DAYS_PRESETS.map((p) => {
                const r = presetRange(p.days);
                const active = dateFrom === r.from && dateTo === r.to;
                return (
                  <Button
                    key={p.days}
                    size="sm"
                    variant={active ? "default" : "ghost"}
                    onClick={() => {
                      setDateFrom(r.from);
                      setDateTo(r.to);
                    }}
                  >
                    {p.label}
                  </Button>
                );
              })}
            </div>
            <input
              placeholder="搜索昵称 / 快手 ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ml-auto h-8 min-w-0 max-w-[220px] flex-1 rounded border border-transparent bg-transparent px-2 text-sm placeholder:text-slate-400 hover:border-slate-200 focus:border-primary focus:bg-white focus:outline-none"
            />
          </div>
        }
        actions={
          <>
            <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showCompare}
                onChange={(e) => setShowCompare(e.target.checked)}
                className="size-3.5 cursor-pointer accent-primary"
              />
              显示同比
            </label>
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportCsv(sortedRows, cols)}
              className="gap-1"
            >
              <Download className="h-3.5 w-3.5" />
              导出 CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setColPicker(true)}
              className="gap-1"
            >
              <Settings2 className="h-3.5 w-3.5" />
              自定义列
            </Button>
          </>
        }
      />

      {/* 项目预设 chip 第二行 */}
      <PresetToolbar label="预设:">
        {PRODUCT_OPTIONS.map((o) => (
          <PresetChip
            key={o.value}
            active={product === o.value}
            onClick={() => setProduct(o.value)}
          >
            {o.label}
          </PresetChip>
        ))}
      </PresetToolbar>

      {/* 数据源切换 */}
      <PresetToolbar label="数据:">
        <PresetChip active={dataSource === "all"} onClick={() => setDataSource("all")}>
          全部
        </PresetChip>
        <PresetChip active={dataSource === "history"} onClick={() => setDataSource("history")}>
          历史权威
        </PresetChip>
        <PresetChip active={dataSource === "today"} onClick={() => setDataSource("today")}>
          今日实时
        </PresetChip>
      </PresetToolbar>

      <KpiGrid items={kpiItems} />

      <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
        <span>
          范围{" "}
          <strong className="text-foreground">
            快手 · {PRODUCT_OPTIONS.find((o) => o.value === product)?.label}
          </strong>
        </span>
        <span>
          时间{" "}
          <strong className="text-foreground tabular-nums">
            {dateFrom}
            {dateFrom !== dateTo && ` ~ ${dateTo}`}
            {matchPreset(dateFrom, dateTo) != null && (
              <span className="text-muted-foreground/70 ml-1">
                ({DAYS_PRESETS.find((p) => p.days === matchPreset(dateFrom, dateTo))?.label})
              </span>
            )}
          </strong>
        </span>
        <span>
          主播 <strong className="text-foreground tabular-nums">{sortedRows.length}</strong>
        </span>
        <span>
          列 <strong className="text-foreground">{cols.length}</strong>/{COLUMNS.length}
        </span>
      </div>

      <div
        className="min-w-0 max-w-full overflow-hidden rounded-lg shadow-sm"
        style={{
          background: "rgba(255, 255, 255, 0.92)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div className="max-h-[calc(100vh-360px)] max-w-full overflow-auto">
          <table className="w-max min-w-full caption-bottom text-sm">
            <TableHeader className="sticky top-0 z-20 bg-secondary [&_th]:bg-secondary">
              <TableRow
                className="hover:bg-secondary"
                style={{ borderBottom: "1px solid var(--border-subtle)" }}
              >
                {cols.map((c) => {
                  const active = sortKey === c.key;
                  return (
                    <TableHead
                      key={c.key}
                      onClick={() => toggleSort(c.key)}
                      className={cn(
                        "h-10 px-3 cursor-pointer select-none transition-colors whitespace-nowrap",
                        c.align === "right" && "text-right",
                        c.sticky && "sticky left-0 z-20 bg-secondary",
                        active ? "text-primary font-semibold" : "text-foreground hover:bg-muted",
                      )}
                      style={c.width ? { width: c.width, maxWidth: c.width } : undefined}
                    >
                      <span
                        className={cn(
                          "inline-flex items-center gap-1",
                          c.align === "right" && "flex-row-reverse",
                        )}
                      >
                        {c.label}
                        <SortIcon active={active} dir={sortDir} />
                      </span>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={cols.length}
                    className="text-muted-foreground h-24 text-center text-sm"
                  >
                    加载中...
                  </TableCell>
                </TableRow>
              ) : pagedRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={cols.length}
                    className="text-muted-foreground h-24 text-center text-sm"
                  >
                    无数据
                  </TableCell>
                </TableRow>
              ) : (
                pagedRows.map((r) => (
                  <TableRow
                    key={r.id}
                    onClick={() => setSelectedAnchor(r)}
                    className="group cursor-pointer hover:bg-[var(--hover-bg)]"
                  >
                    {cols.map((c) => (
                      <TableCell
                        key={c.key}
                        className={cn(
                          "px-3 py-2",
                          c.align === "right" && "text-right tabular-nums",
                          c.sticky &&
                            "sticky left-0 z-10 bg-white group-hover:bg-[var(--hover-bg)]",
                        )}
                        style={c.width ? { width: c.width, maxWidth: c.width } : undefined}
                      >
                        {renderCell(c, r)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </table>
        </div>
      </div>

      <Pagination
        page={safePage}
        totalPages={totalPages}
        pageSize={pageSize}
        total={sortedRows.length}
        onPage={setPage}
        onPageSize={setPageSize}
      />

      <KuaishouAnchorDetailDrawer
        anchor={selectedAnchor}
        onOpenChange={(open) => !open && setSelectedAnchor(null)}
      />

      <ColumnCustomizer<KuaishouColKey>
        open={colPicker}
        onOpenChange={setColPicker}
        selectedKeys={[...visibleCols].filter((k) => k !== "account_name") as KuaishouColKey[]}
        onConfirm={(keys) => {
          // 主播列 (account_name) 是 pinned，不在 customizer 里，但要保留
          const next = new Set<SortKey>(["account_name", ...keys]);
          setVisibleCols(next);
          saveCols(next);
        }}
        allColumns={KS_COLUMNS}
        groups={KS_GROUPS.filter((g) => g !== "基础")} // 基础组（pinned）不出现在 dialog
        getColumnsByGroup={getKsColumnsByGroup}
        getColumnsBySubGroup={getKsColumnsBySubGroup}
      />
    </div>
  );
}

// 兼容（防止下面 unused warning）
void KS_DEFAULT_VISIBLE;

function renderCell(c: ColDef, r: Row): React.ReactNode {
  switch (c.key) {
    case "account_name":
      return (
        <div className="flex items-center gap-2">
          {r.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={r.avatar}
              alt={r.account_name}
              className="h-8 w-8 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="h-8 w-8 shrink-0 rounded-full bg-slate-200" />
          )}
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-foreground">{r.account_name}</span>
            <span className="text-muted-foreground truncate text-xs">
              快手ID: {r.platform_account_id ?? "--"}
            </span>
          </div>
        </div>
      );
    case "product":
      return r.product;
    case "agent_name":
      return (
        r.agent_name ?? (
          <span className="text-muted-foreground">{r.broker_name_raw ?? "未分配"}</span>
        )
      );
    case "fans_count":
      return r.fans_count != null ? r.fans_count.toLocaleString() : "—";
    case "joined_at":
      return r.joined_at ?? "—";
    case "contract_expire_at":
      return <ContractExpireBadge date={r.contract_expire_at} />;
    case "live_status":
      return r.live_status === "living" ? (
        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">直播中</span>
      ) : (
        <span className="text-muted-foreground text-xs">未开播</span>
      );
    case "session_count":
      return r.session_count > 0 ? (
        r.session_count
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "total_amt":
      return r.total_amt > 0 ? (
        <span className="font-medium">{fmtMoney(r.total_amt)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "avg_acu":
      return r.avg_acu > 0 ? (
        Math.round(r.avg_acu)
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "max_peak":
      return r.max_peak > 0 ? (
        fmtChinese(r.max_peak)
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "total_add_fans":
      return r.total_add_fans > 0 ? (
        fmtChinese(r.total_add_fans)
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "total_duration_h":
      return r.total_duration_h > 0 ? (
        `${r.total_duration_h.toFixed(1)}h`
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "total_play_uv":
      return r.total_play_uv > 0 ? (
        fmtChinese(r.total_play_uv)
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "total_play_user_cnt":
      return r.total_play_user_cnt > 0 ? (
        fmtChinese(r.total_play_user_cnt)
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "avg_play_rate":
      return r.avg_play_rate > 0 ? (
        `${(r.avg_play_rate * 100).toFixed(1)}%`
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "avg_per_play_time_min":
      return r.avg_per_play_time_min > 0 ? (
        `${r.avg_per_play_time_min.toFixed(1)}分`
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "total_follow_author":
      return r.total_follow_author > 0 ? (
        fmtChinese(r.total_follow_author)
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "total_cancel_follow":
      return r.total_cancel_follow > 0 ? (
        fmtChinese(r.total_cancel_follow)
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "avg_transfer_fans_rate":
      return r.avg_transfer_fans_rate > 0 ? (
        `${(r.avg_transfer_fans_rate * 100).toFixed(2)}%`
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "total_like_cnt":
      return r.total_like_cnt > 0 ? (
        fmtChinese(r.total_like_cnt)
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "avg_like_rate":
      return r.avg_like_rate > 0 ? (
        `${(r.avg_like_rate * 100).toFixed(0)}%`
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "total_comment_cnt":
      return r.total_comment_cnt > 0 ? (
        fmtChinese(r.total_comment_cnt)
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "avg_comment_rate":
      return r.avg_comment_rate > 0 ? (
        `${(r.avg_comment_rate * 100).toFixed(2)}%`
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "total_share_cnt":
      return r.total_share_cnt > 0 ? (
        fmtChinese(r.total_share_cnt)
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "total_send_gift_uv":
      return r.total_send_gift_uv > 0 ? (
        fmtChinese(r.total_send_gift_uv)
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "total_sent_gift_cnt":
      return r.total_sent_gift_cnt > 0 ? (
        fmtChinese(r.total_sent_gift_cnt)
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "total_report_num":
      return r.total_report_num > 0 ? (
        r.total_report_num
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    default:
      return "—";
  }
}

function pickSortValue(r: Row, key: SortKey): string | number | null {
  if (key === "fans_count") return r.fans_count;
  if (key === "live_status") return r.live_status === "living" ? 1 : 0;
  if (key === "agent_name") return r.agent_name ?? r.broker_name_raw ?? null;
  // 所有数值聚合字段统一返回 number
  const numericKeys: SortKey[] = [
    "session_count",
    "total_amt",
    "avg_acu",
    "max_peak",
    "total_add_fans",
    "total_duration_h",
    "total_play_uv",
    "total_play_user_cnt",
    "avg_play_rate",
    "avg_per_play_time_min",
    "total_follow_author",
    "total_cancel_follow",
    "avg_transfer_fans_rate",
    "total_like_cnt",
    "total_comment_cnt",
    "total_share_cnt",
    "avg_like_rate",
    "avg_comment_rate",
    "total_send_gift_uv",
    "total_sent_gift_cnt",
    "total_report_num",
  ];
  if (numericKeys.includes(key)) {
    return r[key] as number;
  }
  return (r[key] as string | null) ?? null;
}

function ContractExpireBadge({ date }: { date: string | null }): React.JSX.Element {
  if (!date) return <span className="text-muted-foreground">—</span>;
  const exp = new Date(date);
  const now = Date.now();
  const days = Math.floor((exp.getTime() - now) / 86400_000);
  if (days < 0) return <span className="text-rose-500">已过期 {date}</span>;
  if (days <= 90)
    return (
      <span className="text-amber-600">
        {date} <span className="text-xs">({days}天)</span>
      </span>
    );
  return <span className="text-foreground">{date}</span>;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }): React.JSX.Element {
  if (!active) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
  return dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
}

function pageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const out: (number | "...")[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) out.push("...");
  for (let i = left; i <= right; i++) out.push(i);
  if (right < total - 1) out.push("...");
  out.push(total);
  return out;
}

function Pagination({
  page,
  totalPages,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  totalPages: number;
  pageSize: PageSize;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (n: PageSize) => void;
}): React.JSX.Element {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
      <span>
        共 <strong className="text-foreground tabular-nums">{total}</strong> 条 · 当前
        <strong className="text-foreground tabular-nums"> {start}</strong>-
        <strong className="text-foreground tabular-nums">{end}</strong>
      </span>
      <div className="flex items-center gap-2">
        <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v) as PageSize)}>
          <SelectTrigger className="h-8 w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="icon" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {pageNumbers(page, totalPages).map((p, i) =>
          p === "..." ? (
            <span key={`e${i}`} className="text-muted-foreground px-1">
              …
            </span>
          ) : (
            <Button
              key={p}
              size="sm"
              variant={p === page ? "default" : "ghost"}
              onClick={() => onPage(p)}
              className="h-8 min-w-8"
            >
              {p}
            </Button>
          ),
        )}
        <Button
          size="icon"
          variant="ghost"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
