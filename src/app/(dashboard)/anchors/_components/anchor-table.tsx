"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Music2,
  Settings2,
} from "lucide-react";
import { Filters } from "./filters";
import { CsvExportButton } from "./csv-export";
import { ColumnCustomizer } from "./column-customizer";
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
import type { AnchorListRow, AnchorListFilters } from "@/modules/anchors";
import {
  ALL_COLUMNS,
  PRESETS,
  getColumnsByKeys,
  loadSavedColumns,
  saveColumns,
  type ColumnDef,
  type PresetId,
} from "./column-presets";

const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

type ColKey = (typeof ALL_COLUMNS)[number]["key"];

type SortDir = "asc" | "desc";

const PAGE_SIZES = [50, 100, 200] as const;
type PageSize = (typeof PAGE_SIZES)[number];

const DEFAULT_PRESET: PresetId = "ddz";

function getInitialColumns(presetId: PresetId): ColKey[] {
  const saved = loadSavedColumns(presetId);
  if (saved) return saved;
  const preset = PRESETS.find((p) => p.id === presetId);
  // PRESETS always has at least one element (ddz), safe fallback
  const fallback = PRESETS[0];
  return preset ? (preset.keys as ColKey[]) : ((fallback?.keys ?? []) as ColKey[]);
}

export function AnchorTable(): React.JSX.Element {
  const [filters, setFilters] = useState<AnchorListFilters>({
    date_from: yesterday,
    date_to: yesterday,
    project: "all",
  });
  const [rows, setRows] = useState<AnchorListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<ColKey>("total_fan_ticket");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(50);

  const [activePreset, setActivePreset] = useState<PresetId>(DEFAULT_PRESET);
  const [visibleKeys, setVisibleKeys] = useState<ColKey[]>(() => getInitialColumns(DEFAULT_PRESET));
  const [customizerOpen, setCustomizerOpen] = useState(false);

  const visibleColumns = useMemo(() => getColumnsByKeys(visibleKeys), [visibleKeys]);

  useEffect(() => {
    const sp = new URLSearchParams();
    sp.set("date_from", filters.date_from);
    sp.set("date_to", filters.date_to);
    if (filters.project) sp.set("project", filters.project);
    if (filters.search) sp.set("search", filters.search);
    setLoading(true);
    fetch(`/api/anchors?${sp.toString()}`)
      .then((r) => r.json() as Promise<{ rows: AnchorListRow[] }>)
      .then((d) => {
        setRows(d.rows);
        setPage(1);
      })
      .finally(() => setLoading(false));
  }, [filters]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = getValue(a, sortKey);
      const bv = getValue(b, sortKey);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv), "zh-CN");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [sortKey, sortDir, pageSize]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  function toggleSort(key: ColKey): void {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function applyPreset(presetId: PresetId): void {
    setActivePreset(presetId);
    if (presetId === "custom") {
      // 打开自定义弹窗
      setCustomizerOpen(true);
      return;
    }
    const saved = loadSavedColumns(presetId);
    if (saved) {
      setVisibleKeys(saved);
    } else {
      const preset = PRESETS.find((p) => p.id === presetId);
      if (preset) setVisibleKeys(preset.keys as ColKey[]);
    }
  }

  function handleCustomizerConfirm(keys: ColKey[]): void {
    setVisibleKeys(keys);
    saveColumns(activePreset, keys);
  }

  const isRange = filters.date_from !== filters.date_to;
  const totalRow = rows.reduce(
    (acc, r) => ({
      ticket: acc.ticket + (r.total_fan_ticket ?? 0),
      duration: acc.duration + (r.live_duration ?? 0),
      fans: acc.fans + (r.new_follow_fans ?? 0),
    }),
    { ticket: 0, duration: 0, fans: 0 },
  );

  return (
    <div className="space-y-3">
      {/* 顶部：筛选 + 导出 + 自定义列 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Filters filters={filters} onChange={setFilters} />
        <div className="flex items-center gap-2">
          <CsvExportButton rows={sortedRows} visibleColumns={visibleColumns} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCustomizerOpen(true)}
            className="gap-1"
          >
            <Settings2 className="h-3.5 w-3.5" />
            自定义列
          </Button>
        </div>
      </div>

      {/* 产品预设 chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground text-xs mr-1">预设:</span>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => applyPreset(p.id)}
            className={cn(
              "px-2.5 py-0.5 rounded-full text-xs border transition-colors",
              activePreset === p.id
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 摘要行 */}
      <div className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums">
        <span>
          范围 <strong className="text-foreground">{filters.date_from}</strong>
          {isRange && (
            <>
              {" "}
              ~ <strong className="text-foreground">{filters.date_to}</strong>
            </>
          )}
        </span>
        <span>
          主播 <strong className="text-foreground">{rows.length}</strong>
        </span>
        <span>
          总音浪{" "}
          <strong className="text-foreground">{totalRow.ticket.toLocaleString("zh-CN")}</strong>
        </span>
        <span>
          总时长 <strong className="text-foreground">{totalRow.duration.toFixed(1)}h</strong>
        </span>
        <span>
          总涨粉{" "}
          <strong className="text-foreground">{totalRow.fans.toLocaleString("zh-CN")}</strong>
        </span>
        <span className="text-xs">
          列数 <strong className="text-foreground">{visibleColumns.length}</strong>
        </span>
      </div>

      {/* 表格 — 使用原生 <table> 避开 shadcn Table 的内层 overflow wrapper（否则 sticky 表头失效） */}
      <div className="bg-card overflow-hidden rounded-lg border shadow-sm">
        <div className="max-h-[calc(100vh-320px)] overflow-auto">
          <table className="w-full caption-bottom text-sm min-w-max">
            <TableHeader className="sticky top-0 z-20 bg-secondary [&_th]:bg-secondary">
              <TableRow className="border-b-2 hover:bg-secondary">
                {visibleColumns.map((c) => {
                  const active = sortKey === c.key;
                  return (
                    <TableHead
                      key={c.key}
                      onClick={() => toggleSort(c.key)}
                      className={cn(
                        "h-10 px-3 cursor-pointer select-none transition-colors whitespace-nowrap",
                        c.align === "right" && "text-right",
                        c.fmt === "anchor_info" && "w-[220px] max-w-[220px]",
                        c.sticky && "sticky left-0 z-20 bg-secondary",
                        active ? "text-primary font-semibold" : "text-foreground hover:bg-muted",
                      )}
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
                    colSpan={visibleColumns.length}
                    className="text-muted-foreground h-24 text-center text-sm"
                  >
                    加载中...
                  </TableCell>
                </TableRow>
              ) : pagedRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={visibleColumns.length}
                    className="text-muted-foreground h-24 text-center text-sm"
                  >
                    无数据
                  </TableCell>
                </TableRow>
              ) : (
                pagedRows.map((r) => (
                  <TableRow key={r.anchor_id} className="hover:bg-accent/30">
                    {visibleColumns.map((c) => {
                      const v = getValue(r, c.key);
                      // 主播信息合并列：头像 + 昵称 + 抖音号 + UID 三行
                      if (c.fmt === "anchor_info") {
                        return (
                          <TableCell
                            key={c.key}
                            className={cn(
                              "px-3 py-2 w-[220px] max-w-[220px]",
                              c.sticky && "sticky left-0 bg-card",
                            )}
                          >
                            <div className="flex items-center gap-2">
                              {r.avatar ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={r.avatar}
                                  alt={r.nick_name}
                                  className="size-10 rounded-full bg-muted object-cover shrink-0"
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="size-10 rounded-full bg-muted shrink-0" />
                              )}
                              <div className="flex flex-col min-w-0 flex-1 leading-tight">
                                <span className="text-sm font-medium truncate" title={r.nick_name}>
                                  {r.nick_name || "—"}
                                </span>
                                {r.aweme_display_id && (
                                  <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 min-w-0">
                                    <Music2 className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{r.aweme_display_id}</span>
                                  </span>
                                )}
                                <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 min-w-0">
                                  <span className="text-[10px] shrink-0">UID</span>
                                  <span className="truncate">{r.anchor_id}</span>
                                </span>
                              </div>
                            </div>
                          </TableCell>
                        );
                      }
                      // 头像列单独渲染（兼容旧 fmt）
                      if (c.fmt === "avatar") {
                        return (
                          <TableCell key={c.key} className="px-3 py-1">
                            {typeof v === "string" && v ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={v}
                                alt={r.nick_name}
                                className="size-8 rounded-full bg-muted object-cover"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="size-8 rounded-full bg-muted" />
                            )}
                          </TableCell>
                        );
                      }
                      const display = formatCell(v, c.fmt);
                      const muted = display === "—";
                      return (
                        <TableCell
                          key={c.key}
                          className={cn(
                            "px-3 py-2 text-sm whitespace-nowrap",
                            c.align === "right" && "text-right tabular-nums",
                            c.sticky && "sticky left-0 bg-card",
                            c.bold && "font-semibold",
                            muted && "text-muted-foreground",
                          )}
                        >
                          {display}
                        </TableCell>
                      );
                    })}
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

      {/* 自定义列弹窗 */}
      <ColumnCustomizer
        open={customizerOpen}
        onOpenChange={setCustomizerOpen}
        selectedKeys={visibleKeys}
        onConfirm={handleCustomizerConfirm}
      />
    </div>
  );
}

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

function getValue(r: AnchorListRow, key: ColKey): string | number | null {
  if (key === "project") return r.is_threekingdoms ? "三国" : "斗地主";
  const v = r[key as keyof AnchorListRow];
  if (typeof v === "boolean") return v ? 1 : 0;
  return (v as string | number | null) ?? null;
}

function formatCell(v: string | number | null, fmt: ColumnDef["fmt"]): string {
  if (v === null || v === undefined) return "—";
  if (fmt === "duration") {
    if (typeof v !== "number" || v === 0) return "—";
    return `${v.toFixed(1)}h`;
  }
  if (fmt === "number") {
    if (typeof v !== "number" || v === 0) return "—";
    return v.toLocaleString("zh-CN");
  }
  if (fmt === "percent") {
    if (typeof v !== "number" || v === 0) return "—";
    // 值为 0-1 小数
    return `${(v * 100).toFixed(2)}%`;
  }
  if (fmt === "timestamp") {
    if (typeof v !== "number" || v === 0) return "—";
    // unix ms or unix s
    const ms = v > 1e10 ? v : v * 1000;
    return new Date(ms).toLocaleDateString("zh-CN");
  }
  return String(v) || "—";
}

// ─── Pagination ───────────────────────────────────────────────────────────────

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
  onPage: (n: number) => void;
  onPageSize: (s: PageSize) => void;
}): React.JSX.Element {
  const pages = pageNumbers(page, totalPages);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-sm tabular-nums">
      <span>
        共 <strong className="text-foreground">{total}</strong> 条 · 当前{" "}
        <strong className="text-foreground">
          {total === 0 ? 0 : start}-{end}
        </strong>
      </span>
      <div className="flex items-center gap-2">
        <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v) as PageSize)}>
          <SelectTrigger size="sm" className="h-8 min-w-[80px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s} 条/页
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {pages.map((p, i) =>
            p === "..." ? (
              <span key={`ellipsis-${i}`} className="text-muted-foreground px-2">
                …
              </span>
            ) : (
              <Button
                key={p}
                size="sm"
                variant={p === page ? "default" : "ghost"}
                onClick={() => onPage(p)}
                className="h-8 min-w-[32px] px-2"
              >
                {p}
              </Button>
            ),
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
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

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }): React.JSX.Element {
  if (!active) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
  return dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
}
