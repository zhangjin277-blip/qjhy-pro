"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
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
import { KpiPicker } from "./kpi-picker";
import { formatChineseNumber, formatCompare } from "./format";
import { AnchorDetailDrawer } from "./anchor-detail-drawer";
import { KpiGrid } from "@/components/patterns/kpi-grid";
import { PresetChip, PresetToolbar } from "@/components/patterns/preset-toolbar";
import { DataToolbar } from "@/components/patterns/data-toolbar";
import { Button } from "@/components/ui/button";
import { PromptDialog } from "@/components/ui/prompt-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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

  // drill-down 抽屉
  const [selectedAnchor, setSelectedAnchor] = useState<AnchorListRow | null>(null);

  // 从 dashboard 跳转过来时携带 ?anchor_id=xxx → 数据加载后自动打开该主播抽屉（仅一次）
  // 同时支持 ?date_from / ?date_to / ?project 自动应用到 filters（仅在挂载时一次）
  const searchParams = useSearchParams();
  const autoOpenAnchorId = searchParams.get("anchor_id");
  const autoOpenedRef = useRef(false);
  const urlFiltersAppliedRef = useRef(false);
  useEffect(() => {
    if (urlFiltersAppliedRef.current) return;
    const dateFromParam = searchParams.get("date_from");
    const dateToParam = searchParams.get("date_to");
    const projectParam = searchParams.get("project");
    if (!dateFromParam && !dateToParam && !projectParam) {
      urlFiltersAppliedRef.current = true;
      return;
    }
    setFilters((f) => ({
      ...f,
      date_from: dateFromParam ?? f.date_from,
      date_to: dateToParam ?? f.date_to,
      project:
        projectParam === "ddz" || projectParam === "three" || projectParam === "all"
          ? projectParam
          : f.project,
    }));
    // 项目联动预设：?project=three → 三国默认预设 / ?project=ddz → 斗地主默认预设
    // 否则字段会停在 ddz 默认，看三国主播全是 0
    if (projectParam === "three" || projectParam === "ddz") {
      setActivePreset(projectParam);
      const saved = loadSavedColumns(projectParam);
      if (saved) {
        setVisibleKeys(saved);
      } else {
        const preset = PRESETS.find((p) => p.id === projectParam);
        if (preset) setVisibleKeys(preset.keys as ColKey[]);
      }
    }
    urlFiltersAppliedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 用户自定义预设（持久化到 DB，跨设备同步）
  const [userPresets, setUserPresets] = useState<UserColumnPreset[]>([]);
  // 激活预设 key：系统预设 "sys:ddz" / 用户预设 "user:123"
  const [activeUserPresetId, setActiveUserPresetId] = useState<number | null>(null);

  // 自定义弹窗状态：保存为预设（PromptDialog）
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const [pendingSaveColumns, setPendingSaveColumns] = useState<ColKey[] | null>(null);

  // 删除确认弹窗
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null);

  // 首次加载用户预设
  useEffect(() => {
    fetch("/api/column-presets")
      .then((r) => r.json() as Promise<{ presets: UserColumnPreset[] }>)
      .then((d) => setUserPresets(d.presets ?? []))
      .catch(() => setUserPresets([]));
  }, []);

  async function saveAsNewPreset(columns?: ColKey[]): Promise<void> {
    setPendingSaveColumns(columns ?? visibleKeys);
    setSavePromptOpen(true);
  }

  async function doSaveAsNewPreset(name: string): Promise<void> {
    const cols = pendingSaveColumns ?? visibleKeys;
    const res = await fetch("/api/column-presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        columns: cols,
        project: filters.project ?? "all",
      }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(err.error === "NAME_EXISTS" ? "已有同名预设" : "保存失败");
      return;
    }
    const { preset } = (await res.json()) as { preset: UserColumnPreset };
    setUserPresets((arr) => [...arr, preset]);
    setActiveUserPresetId(preset.id);
    setActivePreset("custom");
    setPendingSaveColumns(null);
    toast.success(`预设「${preset.name}」已保存`);
  }

  async function updateCurrentPreset(columns?: ColKey[]): Promise<void> {
    if (!activeUserPresetId) return;
    const cols = columns ?? visibleKeys;
    const res = await fetch(`/api/column-presets/${activeUserPresetId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        columns: cols,
        project: filters.project ?? "all",
      }),
    });
    if (!res.ok) {
      toast.error("更新失败");
      return;
    }
    const { preset } = (await res.json()) as { preset: UserColumnPreset };
    setUserPresets((arr) => arr.map((p) => (p.id === preset.id ? preset : p)));
    setVisibleKeys(cols);
    toast.success(`预设「${preset.name}」已更新`);
  }

  function deleteUserPreset(id: number, name: string): void {
    setDeleteConfirm({ id, name });
  }

  async function doDeleteUserPreset(): Promise<void> {
    if (!deleteConfirm) return;
    const { id, name } = deleteConfirm;
    const res = await fetch(`/api/column-presets/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("删除失败");
      return;
    }
    setUserPresets((arr) => arr.filter((p) => p.id !== id));
    if (activeUserPresetId === id) {
      setActiveUserPresetId(null);
      applyPreset(DEFAULT_PRESET);
    }
    toast.success(`预设「${name}」已删除`);
  }

  function applyUserPreset(p: UserColumnPreset): void {
    setActiveUserPresetId(p.id);
    setActivePreset("custom");
    setVisibleKeys(p.columns as ColKey[]);
    setFilters((f) => ({ ...f, project: p.project ?? "all" }));
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
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/anchors?${sp.toString()}`);
        if (!r.ok) {
          const errBody: { error?: string } = await r.json().catch(() => ({}));
          if (cancelled) return;
          if (r.status === 401) {
            toast.error("登录已失效，请刷新重新登录");
          } else if (r.status === 403) {
            toast.error("无权访问主播明细");
          } else {
            toast.error(
              `加载主播明细失败（${r.status}${errBody.error ? `·${errBody.error}` : ""}）`,
            );
          }
          setRows([]);
          setPreviousRows([]);
          setPeriodDays(1);
          return;
        }
        const d = (await r.json()) as {
          rows?: AnchorListRow[];
          previousRows?: AnchorListRow[];
          days?: number;
        };
        if (cancelled) return;
        setRows(d.rows ?? []);
        setPreviousRows(d.previousRows ?? []);
        setPeriodDays(d.days ?? 1);
        setPage(1);
      } catch (e) {
        if (cancelled) return;
        toast.error("网络错误：" + (e instanceof Error ? e.message : "未知"));
        setRows([]);
        setPreviousRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters]);

  // 数据加载后，如果 URL 携带 ?anchor_id=xxx → 自动打开该主播抽屉（只触发一次）
  // 同时根据 target.is_threekingdoms 切到对应项目预设，避免三国主播显示斗地主字段
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (!autoOpenAnchorId) return;
    if (loading) return;
    if (rows.length === 0) return;
    const target = rows.find((r) => r.anchor_id === autoOpenAnchorId);
    if (target) {
      setSelectedAnchor(target);
      autoOpenedRef.current = true;
      // 跳转主播是三国但当前预设还是斗地主 → 切到三国预设；反之亦然
      const wantPreset: PresetId = target.is_threekingdoms ? "three" : "ddz";
      if (activePreset !== wantPreset && activePreset !== "custom") {
        setActivePreset(wantPreset);
        const saved = loadSavedColumns(wantPreset);
        if (saved) {
          setVisibleKeys(saved);
        } else {
          const preset = PRESETS.find((p) => p.id === wantPreset);
          if (preset) setVisibleKeys(preset.keys as ColKey[]);
        }
      }
    }
  }, [autoOpenAnchorId, loading, rows, activePreset]);

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

  // KPI 卡片：默认按 preset 决定，用户可在卡片上 × 删除 / ⊕ 添加，保存到 localStorage
  const defaultKpiKeysForPreset = (preset: PresetId): ColKey[] => {
    if (preset === "three") {
      return [
        "total_fan_ticket",
        "minigame_total_amount",
        "show_uv",
        "mg_watch_ucnt",
        "mg_active_ucnt",
        "mg_duration",
      ];
    }
    return [
      "total_fan_ticket",
      "controller_total_amount",
      "g_total_amount",
      "v_total_amount",
      "show_uv",
      "g_watch_ucnt",
    ];
  };

  function loadKpiKeys(preset: PresetId): ColKey[] {
    if (typeof window === "undefined") return defaultKpiKeysForPreset(preset);
    try {
      const raw = localStorage.getItem(`anchor_kpi_v1_${preset}`);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        const valid = ALL_COLUMNS.map((c) => c.key as string);
        const filtered = parsed.filter((k) => valid.includes(k)) as ColKey[];
        if (filtered.length > 0) return filtered;
      }
    } catch {
      /* fall through */
    }
    return defaultKpiKeysForPreset(preset);
  }

  const [kpiKeys, setKpiKeys] = useState<ColKey[]>(() => loadKpiKeys(DEFAULT_PRESET));
  const [kpiPickerOpen, setKpiPickerOpen] = useState(false);
  // 切换预设时同步 KPI（除非用户已自定义）
  useEffect(() => {
    setKpiKeys(loadKpiKeys(activePreset));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePreset]);
  function persistKpi(preset: PresetId, keys: ColKey[]): void {
    try {
      localStorage.setItem(`anchor_kpi_v1_${preset}`, JSON.stringify(keys));
    } catch {
      /* ignore */
    }
  }
  function removeKpi(key: ColKey): void {
    const next = kpiKeys.filter((k) => k !== key);
    setKpiKeys(next);
    persistKpi(activePreset, next);
  }
  function addKpis(keys: ColKey[]): void {
    const next = [...kpiKeys, ...keys.filter((k) => !kpiKeys.includes(k))];
    setKpiKeys(next);
    persistKpi(activePreset, next);
  }
  function resetKpis(): void {
    const def = defaultKpiKeysForPreset(activePreset);
    setKpiKeys(def);
    try {
      localStorage.removeItem(`anchor_kpi_v1_${activePreset}`);
    } catch {
      /* ignore */
    }
  }

  function aggregate(rs: AnchorListRow[], key: ColKey, fmt: ColumnDef["fmt"]): number {
    const get = (r: AnchorListRow): unknown => (r as unknown as Record<string, unknown>)[key];
    if (fmt === "percent") {
      const vals = rs.map((r) => Number(get(r) ?? NaN)).filter((n) => Number.isFinite(n));
      if (vals.length === 0) return 0;
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    return rs.reduce((acc, r) => acc + (Number(get(r) ?? 0) || 0), 0);
  }
  const kpiData = kpiKeys
    .map((k) => ALL_COLUMNS.find((c) => c.key === k))
    .filter(
      (c): c is ColumnDef =>
        !!c && (c.fmt === "number" || c.fmt === "duration" || c.fmt === "percent"),
    )
    .map((c) => ({
      key: c.key as ColKey,
      label: c.label,
      fmt: c.fmt,
      cur: aggregate(rows, c.key as ColKey, c.fmt),
      prev: aggregate(previousRows, c.key as ColKey, c.fmt),
    }));

  return (
    <div className="min-w-0 max-w-full space-y-3">
      {/* 顶部：筛选 + 导出 + 自定义列 */}
      <DataToolbar
        filters={<Filters filters={filters} onChange={setFilters} />}
        actions={
          <>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground select-none">
              <input
                type="checkbox"
                checked={showCompare}
                onChange={(e) => setShowCompare(e.target.checked)}
                className="size-3.5 cursor-pointer accent-primary"
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
            <Button size="sm" variant="outline" onClick={() => setKpiPickerOpen(true)}>
              KPI
            </Button>
          </>
        }
      />

      {/* 产品预设 chips */}
      <PresetToolbar label="预设:">
        {PRESETS.filter((p) => p.id !== "custom").map((p) => (
          <PresetChip
            key={p.id}
            active={activePreset === p.id && activeUserPresetId === null}
            onClick={() => {
              setActiveUserPresetId(null);
              applyPreset(p.id);
            }}
          >
            {p.label}
          </PresetChip>
        ))}

        {/* 用户自定义预设（保留 split-chip 实现：label + 删除按钮） */}
        {userPresets.length > 0 && <PresetToolbar.Divider />}
        {userPresets.map((p) => (
          <span key={p.id} className="group inline-flex items-center">
            <button
              type="button"
              onClick={() => applyUserPreset(p)}
              className={cn(
                "rounded-l-full border border-r-0 py-0.5 pr-1.5 pl-2.5 text-xs transition-colors",
                activeUserPresetId === p.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
              )}
            >
              {p.name}
            </button>
            <button
              type="button"
              onClick={() => deleteUserPreset(p.id, p.name)}
              className={cn(
                "rounded-r-full border px-1.5 py-0.5 text-xs transition-colors",
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
      </PresetToolbar>

      {/* KPI 卡片 */}
      <KpiGrid
        items={kpiData.map((m) => {
          const compare = formatCompare(m.cur, m.prev, periodDays);
          const display =
            m.fmt === "percent"
              ? `${(m.cur * 100).toFixed(2)}%`
              : m.fmt === "duration"
                ? `${m.cur.toFixed(1)}h`
                : formatChineseNumber(m.cur);
          return {
            key: m.key,
            label: m.label,
            value: display,
            onRemove: () => removeKpi(m.key),
            footer: compare ? (
              <>
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
              </>
            ) : null,
          };
        })}
      />

      {/* KPI 选择器 */}
      <KpiPicker
        open={kpiPickerOpen}
        onOpenChange={setKpiPickerOpen}
        excluded={kpiKeys}
        onAdd={addKpis}
        onReset={resetKpis}
      />

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
      <div
        className="min-w-0 max-w-full overflow-hidden rounded-lg shadow-sm"
        style={{
          background: "rgba(255, 255, 255, 0.92)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div className="max-h-[calc(100vh-320px)] max-w-full overflow-auto">
          <table className="w-max min-w-full caption-bottom text-sm">
            <TableHeader className="sticky top-0 z-20 bg-secondary [&_th]:bg-secondary">
              <TableRow
                className="hover:bg-secondary"
                style={{ borderBottom: "1px solid var(--border-subtle)" }}
              >
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
                  <TableRow key={r.anchor_id} className="group hover:bg-[var(--hover-bg)]">
                    {visibleColumns.map((c) => {
                      const v = getValue(r, c.key);
                      // 主播信息合并列：头像 + 昵称 + 抖音号 + UID 三行
                      if (c.fmt === "anchor_info") {
                        return (
                          <TableCell
                            key={c.key}
                            className={cn(
                              "px-3 py-2 w-[220px] max-w-[220px]",
                              c.sticky &&
                                "sticky left-0 bg-card transition-colors group-hover:bg-[var(--hover-bg)]",
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedAnchor(r)}
                                className="shrink-0 rounded-full ring-offset-2 ring-offset-card cursor-pointer hover:ring-2 hover:ring-primary/40 transition-shadow"
                                title="查看日明细"
                                aria-label={`查看 ${r.nick_name} 的日明细`}
                              >
                                {r.avatar ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={r.avatar}
                                    alt={r.nick_name}
                                    className="size-10 rounded-full bg-muted object-cover block"
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="size-10 rounded-full bg-muted" />
                                )}
                              </button>
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
                            c.sticky &&
                              "sticky left-0 bg-card transition-colors group-hover:bg-[var(--hover-bg)]",
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
        activeUserPresetName={
          activeUserPresetId !== null
            ? (userPresets.find((p) => p.id === activeUserPresetId)?.name ?? null)
            : null
        }
        onUpdatePreset={updateCurrentPreset}
        onSaveAsNewPreset={saveAsNewPreset}
      />

      <AnchorDetailDrawer
        anchor={selectedAnchor}
        dateFrom={filters.date_from}
        dateTo={filters.date_to}
        kpiColumns={kpiKeys
          .map((k) => ALL_COLUMNS.find((c) => c.key === k))
          .filter((c): c is ColumnDef => !!c)}
        visibleColumns={visibleColumns}
        onOpenChange={(open) => {
          if (!open) setSelectedAnchor(null);
        }}
      />

      <PromptDialog
        open={savePromptOpen}
        title="保存为新预设"
        placeholder="预设名称（最长 40 字）"
        maxLength={40}
        onOpenChange={(o) => {
          setSavePromptOpen(o);
          if (!o) setPendingSaveColumns(null);
        }}
        onConfirm={(name) => {
          void doSaveAsNewPreset(name);
        }}
      />

      <ConfirmDialog
        open={deleteConfirm !== null}
        title={deleteConfirm ? `删除预设「${deleteConfirm.name}」？` : ""}
        description="删除后无法恢复"
        confirmText="删除"
        variant="danger"
        onOpenChange={(o) => {
          if (!o) setDeleteConfirm(null);
        }}
        onConfirm={() => {
          void doDeleteUserPreset();
        }}
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
