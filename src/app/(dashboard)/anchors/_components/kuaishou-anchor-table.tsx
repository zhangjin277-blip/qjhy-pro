"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { KpiGrid, type KpiItem } from "@/components/patterns/kpi-grid";
import { PresetChip, PresetToolbar } from "@/components/patterns/preset-toolbar";
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
import { cn } from "@/lib/utils/cn";
import { KuaishouAnchorDetailDrawer } from "./kuaishou-anchor-detail-drawer";

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
  // 时间窗聚合
  session_count: number;
  total_amt: number;
  avg_acu: number;
  max_peak: number;
  total_add_fans: number;
  total_duration_h: number;
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
  { value: 1, label: "昨日" },
  { value: 7, label: "近 7 日" },
  { value: 30, label: "近 30 日" },
];

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
  | "total_duration_h";
type SortDir = "asc" | "desc";

const PAGE_SIZES = [50, 100, 200] as const;
type PageSize = (typeof PAGE_SIZES)[number];

interface ColDef {
  key: SortKey;
  label: string;
  group: "基础" | "公会" | "直播表现" | "其他";
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
  { key: "max_peak", label: "峰值在线", group: "直播表现", align: "right", defaultVisible: false },
  {
    key: "total_add_fans",
    label: "涨粉",
    group: "直播表现",
    align: "right",
    defaultVisible: false,
  },
  {
    key: "total_duration_h",
    label: "直播时长",
    group: "直播表现",
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
  const [product, setProduct] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [days, setDays] = useState<number>(7);
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

  // 加载数据
  useEffect(() => {
    setLoading(true);
    let cancelled = false;
    const sp = new URLSearchParams();
    sp.set("product", product);
    sp.set("days", String(days));
    if (debouncedSearch) sp.set("search", debouncedSearch);
    (async () => {
      try {
        const r = await fetch(`/api/anchors-kuaishou?${sp.toString()}`);
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
  }, [product, debouncedSearch, days]);

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
          <>
            <PresetToolbar label="项目:">
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
            <PresetToolbar label="时间:">
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
            <input
              type="text"
              placeholder="搜索昵称 / 快手 ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-56 rounded border border-slate-300 px-2 text-sm focus:border-primary focus:outline-none"
            />
          </>
        }
        actions={
          <div ref={colPickerRef} className="relative">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setColPicker(!colPicker)}
            >
              列设置 ({visibleCols.size}/{COLUMNS.length})
            </Button>
            {colPicker && (
              <div className="absolute right-0 top-full z-50 mt-1 w-[300px] rounded-md border border-slate-200 bg-white p-3 shadow-lg">
                {(["基础", "公会", "直播表现", "其他"] as const).map((g) => {
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
                              disabled={c.key === "account_name"}
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
                      const next = new Set<SortKey>(
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
        }
      />

      <KpiGrid items={kpiItems} />

      <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
        <span>
          范围{" "}
          <strong className="text-foreground">
            快手 · {PRODUCT_OPTIONS.find((o) => o.value === product)?.label}
          </strong>
        </span>
        <span>
          时间窗{" "}
          <strong className="text-foreground">
            {DAYS_PRESETS.find((p) => p.value === days)?.label}
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
    </div>
  );
}

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
    default:
      return "—";
  }
}

function pickSortValue(r: Row, key: SortKey): string | number | null {
  if (key === "fans_count") return r.fans_count;
  if (key === "live_status") return r.live_status === "living" ? 1 : 0;
  if (key === "agent_name") return r.agent_name ?? r.broker_name_raw ?? null;
  if (
    key === "session_count" ||
    key === "total_amt" ||
    key === "avg_acu" ||
    key === "max_peak" ||
    key === "total_add_fans" ||
    key === "total_duration_h"
  ) {
    return r[key];
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
