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
import type { UserColumnPreset } from "@/modules/column-presets";
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
  PINNED_COLUMNS,
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
  const [previousRows, setPreviousRows] = useState<AnchorListRow[]>([]);
  const [periodDays, setPeriodDays] = useState(1);
  const [showCompare, setShowCompare] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<ColKey>("total_fan_ticket");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(50);

  const [activePreset, setActivePreset] = useState<PresetId>(DEFAULT_PRESET);
  const [visibleKeys, setVisibleKeys] = useState<ColKey[]>(() => getInitialColumns(DEFAULT_PRESET));
  const [customizerOpen, setCustomizerOpen] = useState(false);

  // 用户自定义预设（持久化到 DB，跨设备同步）
  const [userPresets, setUserPresets] = useState<UserColumnPreset[]>([]);
  // 激活预设 key：系统预设 "sys:ddz" / 用户预设 "user:123"
  const [activeUserPresetId, setActiveUserPresetId] = useState<number | null>(null);

  // 首次加载用户预设
  useEffect(() => {
    fetch("/api/column-presets")
      .then((r) => r.json() as Promise<{ presets: UserColumnPreset[] }>)
      .then((d) => setUserPresets(d.presets ?? []))
      .catch(() => setUserPresets([]));
  }, []);

  async function saveAsNewPreset(): Promise<void> {
    const name = window.prompt("预设名称（最长 40 字）");
    if (!name || !name.trim()) return;
    const res = await fetch("/api/column-presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), columns: visibleKeys }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      window.alert(err.error === "NAME_EXISTS" ? "已有同名预设" : "保存失败");
      return;
    }
    const { preset } = (await res.json()) as { preset: UserColumnPreset };
    setUserPresets((arr) => [...arr, preset]);
    setActiveUserPresetId(preset.id);
    setActivePreset("custom");
  }

  async function deleteUserPreset(id: number, name: string): Promise<void> {
    if (!window.confirm(`删除预设「${name}」？`)) return;
    const res = await fetch(`/api/column-presets/${id}`, { method: "DELETE" });
    if (!res.ok) {
      window.alert("删除失败");
      return;
    }
    setUserPresets((arr) => arr.filter((p) => p.id !== id));
    if (activeUserPresetId === id) {
      setActiveUserPresetId(null);
      applyPreset(DEFAULT_PRESET);
    }
  }

  function applyUserPreset(p: UserColumnPreset): void {
    setActiveUserPresetId(p.id);
    setActivePreset("custom");
    setVisibleKeys(p.columns as ColKey[]);
  }

  // 永远在最前渲染 pinned 列（主播信息），不能在 customizer 取消/排序
  const visibleColumns = useMemo(
    () => [...PINNED_COLUMNS, ...getColumnsByKeys(visibleKeys)],
    [visibleKeys],
  );

  useEffect(() => {
    const sp = new URLSearchParams();
    sp.set("date_from", filters.date_from);
    sp.set("date_to", filters.date_to);
    if (filters.project) sp.set("project", filters.project);
    if (filters.search) sp.set("search", filters.search);
    setLoading(true);
    fetch(`/api/anchors?${sp.toString()}`)
      .then(
        (r) =>
          r.json() as Promise<{
            rows: AnchorListRow[];
            previousRows: AnchorListRow[];
            days: number;
          }>,
      )
      .then((d) => {
        setRows(d.rows);
        setPreviousRows(d.previousRows ?? []);
        setPeriodDays(d.days ?? 1);
        setPage(1);
      })
      .finally(() => setLoading(false));
  }, [filters]);

  // 前一周期数据按 anchor_id 索引
  const prevByAnchorId = useMemo(() => {
    const m = new Map<string, AnchorListRow>();
    for (const r of previousRows) m.set(r.anchor_id, r);
    return m;
  }, [previousRows]);

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
    // 同步项目筛选：斗地主/三国预设自动切到对应项目，公会/全部默认不限项目
    const projectByPreset: Record<Exclude<PresetId, "custom">, "all" | "ddz" | "three"> = {
      ddz: "ddz",
      three: "three",
      guild: "all",
      all: "all",
    };
    setFilters((f) => ({ ...f, project: projectByPreset[presetId] }));
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

  // KPI 卡片（按 preset 决定指标集；当前 ddz 用以下 6 项）
  const kpiMetrics: { key: keyof AnchorListRow; label: string; fmt: "number" }[] = [
    { key: "total_fan_ticket", label: "总音浪", fmt: "number" },
    { key: "controller_total_amount", label: "小手柄流水", fmt: "number" },
    { key: "g_total_amount", label: "直播流水", fmt: "number" },
    { key: "v_total_amount", label: "短视频流水", fmt: "number" },
    { key: "show_uv", label: "曝光人数", fmt: "number" },
    { key: "g_watch_ucnt", label: "游戏直播看播人数", fmt: "number" },
  ];
  function sumKey(rs: AnchorListRow[], key: keyof AnchorListRow): number {
    return rs.reduce((acc, r) => acc + (Number(r[key] ?? 0) || 0), 0);
  }
  const kpiData = kpiMetrics.map((m) => ({
    ...m,
    cur: sumKey(rows, m.key),
    prev: sumKey(previousRows, m.key),
  }));

  return (
    <div className="space-y-3">
      {/* 顶部：筛选 + 导出 + 自定义列 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Filters filters={filters} onChange={setFilters} />
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showCompare}
              onChange={(e) => setShowCompare(e.target.checked)}
              className="size-3.5 accent-primary cursor-pointer"
            />
            显示同比
          </label>
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
          <Button size="sm" variant="outline" onClick={saveAsNewPreset}>
            保存预设
          </Button>
        </div>
      </div>

      {/* 产品预设 chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground text-xs mr-1">预设:</span>
        {PRESETS.filter((p) => p.id !== "custom").map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setActiveUserPresetId(null);
              applyPreset(p.id);
            }}
            className={cn(
              "px-2.5 py-0.5 rounded-full text-xs border transition-colors",
              activePreset === p.id && activeUserPresetId === null
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
            )}
          >
            {p.label}
          </button>
        ))}

        {/* 用户自定义预设 */}
        {userPresets.length > 0 && <span className="text-muted-foreground text-xs mx-1">|</span>}
        {userPresets.map((p) => (
          <span key={p.id} className="inline-flex items-center group">
            <button
              onClick={() => applyUserPreset(p)}
              className={cn(
                "pl-2.5 pr-1.5 py-0.5 rounded-l-full text-xs border border-r-0 transition-colors",
                activeUserPresetId === p.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
              )}
            >
              {p.name}
            </button>
            <button
              onClick={() => deleteUserPreset(p.id, p.name)}
              className={cn(
                "px-1.5 py-0.5 rounded-r-full text-xs border transition-colors",
                activeUserPresetId === p.id
                  ? "bg-primary text-primary-foreground border-primary hover:bg-primary/80"
                  : "border-border text-muted-foreground hover:border-change-up/60 hover:text-change-up",
              )}
              title="删除预设"
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {/* KPI 卡片 */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {kpiData.map((m) => {
          const compare = formatCompare(m.cur, m.prev, periodDays);
          return (
            <div key={m.key} className="bg-card rounded-lg border border-border px-4 py-3">
              <div className="text-muted-foreground text-xs">{m.label}</div>
              <div className="kpi-value mt-1">{formatChineseNumber(m.cur)}</div>
              {compare && (
                <div className="text-muted-foreground mt-1 text-xs">
                  <span className="text-muted-foreground/70">{compare.text.split(" ")[0]}</span>
                  <span
                    className={cn(
                      "ml-1",
                      compare.kind === "up" && "text-change-up",
                      compare.kind === "down" && "text-change-down",
                    )}
                  >
                    {compare.text.split(" ").slice(1).join(" ")}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 摘要小字 */}
      <div className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-xs tabular-nums">
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
                      // 数值类列加上「较前 N 日」对比（受顶部勾选控制）
                      const isNumericCol =
                        (c.fmt === "number" || c.fmt === "duration" || c.fmt === "percent") &&
                        typeof v === "number";
                      const enableCompare = showCompare && isNumericCol;
                      const prev = enableCompare ? prevByAnchorId.get(r.anchor_id) : undefined;
                      const prevValRaw = prev ? getValue(prev, c.key) : null;
                      const prevVal = typeof prevValRaw === "number" ? prevValRaw : null;
                      const compare = enableCompare
                        ? formatCompare(v as number, prevVal, periodDays)
                        : null;
                      return (
                        <TableCell
                          key={c.key}
                          className={cn(
                            "px-3 py-3 text-sm whitespace-nowrap",
                            c.align === "right" && "text-right tabular-nums",
                            c.sticky && "sticky left-0 bg-card",
                            c.bold && "font-semibold",
                            muted && "text-muted-foreground",
                          )}
                        >
                          <div>{display}</div>
                          {compare && (
                            <div
                              className={cn(
                                "text-xs font-normal mt-1 text-muted-foreground",
                                c.bold && "font-normal",
                              )}
                            >
                              <span className="text-muted-foreground/70">
                                {compare.text.split(" ")[0]}
                              </span>
                              {compare.kind !== "flat" && compare.kind !== "none" && (
                                <span
                                  className={cn(
                                    "ml-1",
                                    compare.kind === "up" && "text-change-up",
                                    compare.kind === "down" && "text-change-down",
                                  )}
                                >
                                  {compare.text.split(" ").slice(1).join(" ")}
                                </span>
                              )}
                              {(compare.kind === "flat" || compare.kind === "none") && (
                                <span className="ml-1">
                                  {compare.text.split(" ").slice(1).join(" ")}
                                </span>
                              )}
                            </div>
                          )}
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

/** 数字缩写：>= 1万 显示 X.XX万，>= 1亿 显示 X.XX亿；否则千分位 */
function formatChineseNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return `${(n / 100_000_000).toFixed(2).replace(/\.?0+$/, "")}亿`;
  if (abs >= 10_000) return `${(n / 10_000).toFixed(2).replace(/\.?0+$/, "")}万`;
  return n.toLocaleString("zh-CN");
}

/** 同比对比：对比当前值 vs 前一周期同长度的值，返回带箭头的小字 */
function formatCompare(
  cur: number,
  prev: number | null,
  periodDays: number,
): { text: string; kind: "up" | "down" | "flat" | "none" } | null {
  const label = `较前${periodDays}日`;
  if (prev === null || prev === 0) {
    if (cur === 0) return { text: `${label} 持平`, kind: "flat" };
    return { text: `${label} —`, kind: "none" };
  }
  if (cur === prev) return { text: `${label} 持平`, kind: "flat" };
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 0.01) return { text: `${label} 持平`, kind: "flat" };
  const arrow = pct > 0 ? "↑" : "↓";
  return {
    text: `${label} ${arrow}${Math.abs(pct).toFixed(2)}%`,
    kind: pct > 0 ? "up" : "down",
  };
}

function formatCell(v: string | number | null, fmt: ColumnDef["fmt"]): string {
  if (fmt === "duration") {
    if (typeof v !== "number") return "0h";
    return `${v.toFixed(1)}h`;
  }
  if (fmt === "number") {
    if (typeof v !== "number") return "0";
    return formatChineseNumber(v);
  }
  if (fmt === "percent") {
    if (typeof v !== "number") return "0%";
    // 值为 0-1 小数
    return `${(v * 100).toFixed(2)}%`;
  }
  if (fmt === "timestamp") {
    if (typeof v !== "number" || v === 0) return "—";
    // unix ms or unix s
    const ms = v > 1e10 ? v : v * 1000;
    return new Date(ms).toLocaleDateString("zh-CN");
  }
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
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
