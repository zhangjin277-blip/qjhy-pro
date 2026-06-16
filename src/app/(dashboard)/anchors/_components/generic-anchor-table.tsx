"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Settings2,
} from "lucide-react";
import { ColumnCustomizer } from "./column-customizer";
import { KpiPicker } from "./kpi-picker";
import { formatChineseNumber, formatCompare } from "./format";
import { KpiGrid, type KpiItem } from "@/components/patterns/kpi-grid";
import { PresetChip, PresetToolbar } from "@/components/patterns/preset-toolbar";
import { DataToolbar } from "@/components/patterns/data-toolbar";
import { Button } from "@/components/ui/button";
import { PromptDialog } from "@/components/ui/prompt-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils/cn";
import type { UserColumnPreset } from "@/modules/column-presets";
import type { ColumnDef } from "./column-presets";
import type {
  AnchorFilters,
  BrokerOptions,
  BrokerSelection,
  PlatformConfig,
} from "./platform-config";

const EMPTY_BROKER_SEL: BrokerSelection = { operate: [], recruit: [] };

const PAGE_SIZES = [15, 50, 100, 200] as const;
type PageSize = (typeof PAGE_SIZES)[number];
type SortDir = "asc" | "desc";

export function GenericAnchorTable<TKey extends string, TRow>({
  config,
}: {
  config: PlatformConfig<TKey, TRow>;
}): React.JSX.Element {
  // ── State ──────────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<AnchorFilters>(config.defaultFilters);
  const [rows, setRows] = useState<TRow[]>([]);
  const [previousRows, setPreviousRows] = useState<TRow[]>([]);
  // 经纪人筛选（客户端，仅 config.brokerFilter 启用的平台）— 不进 filters，不触发 server 请求
  const [brokerSel, setBrokerSel] = useState<BrokerSelection>(EMPTY_BROKER_SEL);
  const [serverKpi, setServerKpi] = useState<Record<string, number> | null>(null);
  const [periodDays, setPeriodDays] = useState(1);
  const [showCompare, setShowCompare] = useState(true);
  const [loading, setLoading] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [loadedApiParams, setLoadedApiParams] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<TKey>(config.defaultSort.key);
  const [sortDir, setSortDir] = useState<SortDir>(config.defaultSort.dir);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(
    (config.defaultPageSize as PageSize | undefined) ?? 50,
  );

  const [activePresetId, setActivePresetId] = useState<string>(config.defaultSystemPresetId);
  const [visibleKeys, setVisibleKeys] = useState<TKey[]>(() =>
    loadVisibleKeys(config, config.defaultSystemPresetId),
  );
  const [customizerOpen, setCustomizerOpen] = useState(false);

  const [selectedRow, setSelectedRow] = useState<TRow | null>(null);

  // 用户预设（仅 douyin 启用）
  const [userPresets, setUserPresets] = useState<UserColumnPreset[]>([]);
  const [activeUserPresetId, setActiveUserPresetId] = useState<number | null>(null);
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const [pendingSaveColumns, setPendingSaveColumns] = useState<TKey[] | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null);

  // KPI Picker（仅 client mode + kpiPickerEnabled）
  const [kpiPickerOpen, setKpiPickerOpen] = useState(false);
  const [kpiKeys, setKpiKeys] = useState<TKey[]>(() =>
    loadKpiKeys(config, config.defaultSystemPresetId),
  );

  const requestedFieldKeys = useMemo(
    () => uniqueKeys([...visibleKeys, ...kpiKeys, sortKey]),
    [visibleKeys, kpiKeys, sortKey],
  );

  // ── URL 初始应用（mount 一次） ─────────────────────────────────────────────
  const searchParams = useSearchParams();
  const autoOpenAnchorId = searchParams.get("anchor_id");
  const autoOpenedRef = useRef(false);
  const urlFiltersAppliedRef = useRef(false);

  useEffect(() => {
    if (urlFiltersAppliedRef.current) return;
    const next: AnchorFilters = { ...filters };
    let touched = false;
    const dateFromParam = searchParams.get("date_from");
    const dateToParam = searchParams.get("date_to");
    const projectParam = searchParams.get("project");
    const productParam = searchParams.get("product");
    const searchParam = searchParams.get("search");
    const dataSourceParam = searchParams.get("data_source");
    if (dateFromParam) {
      next.date_from = dateFromParam;
      touched = true;
    }
    if (dateToParam) {
      next.date_to = dateToParam;
      touched = true;
    }
    if (projectParam) {
      next.project = projectParam;
      touched = true;
    }
    if (productParam) {
      next.product = productParam;
      touched = true;
    }
    if (searchParam) {
      next.search = searchParam;
      touched = true;
    }
    if (dataSourceParam === "all" || dataSourceParam === "today" || dataSourceParam === "history") {
      next.data_source = dataSourceParam;
      touched = true;
    }
    // project=ddz/three → 联动预设
    if (config.colsByPreset && projectParam) {
      const matchPreset = config.systemPresets.find(
        (p) => p.appliesFilter?.project === projectParam,
      );
      if (matchPreset) {
        setActivePresetId(matchPreset.id);
        setVisibleKeys(loadVisibleKeys(config, matchPreset.id));
      }
    }
    if (touched) setFilters(next);
    urlFiltersAppliedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 用户预设加载（仅 userPresetsEnabled） ─────────────────────────────────
  useEffect(() => {
    if (!config.userPresetsEnabled) return;
    fetch(`/api/column-presets?platform=${config.id}`)
      .then((r) => r.json() as Promise<{ presets: UserColumnPreset[] }>)
      .then((d) => setUserPresets(d.presets ?? []))
      .catch(() => setUserPresets([]));
  }, [config.userPresetsEnabled, config.id]);

  // ── 数据 fetch + URL 同步 ────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setCompareLoading(false);
    setLoadedApiParams(null);
    let cancelled = false;
    const apiSp = config.buildApiParams(filters);
    // URL 同步（含 platform=id）
    if (typeof window !== "undefined") {
      const urlSp = new URLSearchParams(apiSp);
      urlSp.set("platform", config.id);
      const url = `${window.location.pathname}?${urlSp.toString()}`;
      window.history.replaceState(null, "", url);
    }
    appendFieldParams(apiSp, requestedFieldKeys);
    const apiParamsString = apiSp.toString();
    (async () => {
      try {
        const r = await fetch(`${config.apiEndpoint}?${apiParamsString}`);
        if (!r.ok) {
          const errBody: { error?: string } = await r.json().catch(() => ({}));
          if (cancelled) return;
          if (r.status === 401) toast.error("登录已失效，请刷新重新登录");
          else if (r.status === 403) toast.error("无权访问主播明细");
          else
            toast.error(
              `加载主播明细失败（${r.status}${errBody.error ? `·${errBody.error}` : ""}）`,
            );
          setRows([]);
          setPreviousRows([]);
          setServerKpi(null);
          setPeriodDays(1);
          setLoadedApiParams(null);
          return;
        }
        const json = await r.json();
        if (cancelled) return;
        const parsed = config.parseApiResponse(json);
        setRows(parsed.rows);
        setPreviousRows(config.compareEndpoint ? [] : (parsed.previousRows ?? []));
        setServerKpi(parsed.serverKpi ?? null);
        setLoadedApiParams(apiParamsString);
        // 优先用 API 返回的 days；否则从 filters.date_from/to 算（含两端）
        const fallbackDays =
          Math.max(
            1,
            Math.round(
              (Date.parse(`${filters.date_to}T00:00:00Z`) -
                Date.parse(`${filters.date_from}T00:00:00Z`)) /
                86_400_000,
            ) + 1,
          ) || 1;
        setPeriodDays(parsed.days ?? fallbackDays);
        setPage(1);
      } catch (e) {
        if (cancelled) return;
        toast.error("网络错误：" + (e instanceof Error ? e.message : "未知"));
        setRows([]);
        setPreviousRows([]);
        setServerKpi(null);
        setLoadedApiParams(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, requestedFieldKeys]);

  useEffect(() => {
    if (!config.compareEndpoint || config.compareMode === "none" || !showCompare) {
      if (config.compareEndpoint) {
        setCompareLoading(false);
        setPreviousRows([]);
      }
      return;
    }
    if (!loadedApiParams) return;

    let cancelled = false;
    setCompareLoading(true);
    setPreviousRows([]);

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const r = await fetch(`${config.compareEndpoint}?${loadedApiParams}`);
          if (!r.ok) {
            if (!cancelled) setPreviousRows([]);
            return;
          }
          const json = await r.json();
          if (cancelled) return;
          const parsed = config.parseApiResponse(json);
          setPreviousRows(parsed.previousRows ?? parsed.rows ?? []);
          if (parsed.days) setPeriodDays(parsed.days);
        } catch {
          if (!cancelled) setPreviousRows([]);
        } finally {
          if (!cancelled) setCompareLoading(false);
        }
      })();
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedApiParams, showCompare, config.compareEndpoint]);

  // ?anchor_id auto-open 抽屉 + 联动 preset
  useEffect(() => {
    if (autoOpenedRef.current || !autoOpenAnchorId || loading || rows.length === 0) return;
    const target = rows.find(
      (r) => String((r as Record<string, unknown>)[config.rowKey as string]) === autoOpenAnchorId,
    );
    if (target) {
      setSelectedRow(target);
      autoOpenedRef.current = true;
      // 联动 preset（仅 colsByPreset）
      if (config.colsByPreset && config.resolvePresetForRow) {
        const wantPreset = config.resolvePresetForRow(target);
        if (wantPreset && wantPreset !== activePresetId && activePresetId !== "custom") {
          setActivePresetId(wantPreset);
          setVisibleKeys(loadVisibleKeys(config, wantPreset));
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenAnchorId, loading, rows]);

  // sort 改变重置 page
  useEffect(() => {
    setPage(1);
  }, [sortKey, sortDir, pageSize]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const visibleColumns = useMemo<ColumnDef<TKey>[]>(() => {
    const map = new Map(config.allColumns.map((c) => [c.key, c]));
    const pinnedKeys = new Set(config.pinnedColumns.map((c) => c.key));
    const picked = uniqueKeys(visibleKeys)
      .filter((k) => !pinnedKeys.has(k))
      .map((k) => map.get(k))
      .filter(Boolean) as ColumnDef<TKey>[];
    return [...config.pinnedColumns, ...picked];
  }, [visibleKeys, config.allColumns, config.pinnedColumns]);

  const prevByKey = useMemo(() => {
    const m = new Map<string, TRow>();
    for (const r of previousRows) {
      const k = String((r as Record<string, unknown>)[config.rowKey as string]);
      m.set(k, r);
    }
    return m;
  }, [previousRows, config.rowKey]);

  // ── 经纪人筛选（客户端）：选项从当前 rows 去重；baseRows = 过滤后的行 ──────────
  const brokerOptions = useMemo<BrokerOptions | null>(() => {
    if (!config.brokerFilter) return null;
    const op = new Set<string>();
    const rc = new Set<string>();
    for (const r of rows) {
      const o = config.brokerFilter.getOperate(r);
      const c = config.brokerFilter.getRecruit(r);
      if (o) op.add(o);
      if (c) rc.add(c);
    }
    const sortZh = (a: string, b: string): number => a.localeCompare(b, "zh-CN");
    return { operate: [...op].sort(sortZh), recruit: [...rc].sort(sortZh) };
  }, [rows, config]);

  const brokerActive = brokerSel.operate.length > 0 || brokerSel.recruit.length > 0;

  const baseRows = useMemo(() => {
    const bf = config.brokerFilter;
    if (!bf || !brokerActive) return rows;
    const opSet = new Set(brokerSel.operate);
    const rcSet = new Set(brokerSel.recruit);
    return rows.filter((r) => {
      if (brokerSel.operate.length > 0) {
        const o = bf.getOperate(r);
        if (!o || !opSet.has(o)) return false;
      }
      if (brokerSel.recruit.length > 0) {
        const c = bf.getRecruit(r);
        if (!c || !rcSet.has(c)) return false;
      }
      return true;
    });
  }, [rows, brokerSel, brokerActive, config]);

  // KPI 对比的 previousRows 同步过滤到 baseRows 的行集合，保证「较前期」口径一致
  const basePreviousRows = useMemo(() => {
    if (!config.brokerFilter || !brokerActive) return previousRows;
    const keySet = new Set(
      baseRows.map((r) => String((r as Record<string, unknown>)[config.rowKey as string])),
    );
    return previousRows.filter((r) =>
      keySet.has(String((r as Record<string, unknown>)[config.rowKey as string])),
    );
  }, [previousRows, baseRows, brokerActive, config]);

  // 选经纪人后回到第 1 页
  useEffect(() => {
    setPage(1);
  }, [brokerSel]);

  const sortedRows = useMemo(() => {
    const copy = [...baseRows];
    copy.sort((a, b) => {
      const av = getSortVal(config, a, sortKey);
      const bv = getSortVal(config, b, sortKey);
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
  }, [baseRows, sortKey, sortDir, config]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  // KPI items
  const kpiItems = useMemo<KpiItem[]>(() => {
    if (config.kpiMode === "server") {
      if (!serverKpi || !config.buildKpiItems) return [];
      return config.buildKpiItems(serverKpi).map((s) => ({
        key: s.key,
        label: s.label,
        value: s.value,
        footer: s.footer,
      }));
    }
    // client mode：从 rows 聚合
    return kpiKeys
      .map((k) => config.allColumns.find((c) => c.key === k))
      .filter(
        (c): c is ColumnDef<TKey> =>
          !!c && (c.fmt === "number" || c.fmt === "duration" || c.fmt === "percent"),
      )
      .map((c) => {
        const cur = aggregate(baseRows, c.key, c.fmt);
        const prev = aggregate(basePreviousRows, c.key, c.fmt);
        const compare = formatCompare(cur, prev, periodDays);
        const display =
          c.fmt === "percent"
            ? `${(cur * 100).toFixed(2)}%`
            : c.fmt === "duration"
              ? `${cur.toFixed(1)}h`
              : formatChineseNumber(cur);
        return {
          key: c.key as string,
          label: c.label,
          value: display,
          onRemove: () => removeKpi(c.key),
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
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, kpiKeys, baseRows, basePreviousRows, serverKpi, periodDays]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function toggleSort(key: TKey): void {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function applyPreset(presetId: string): void {
    if (presetId === "custom") {
      setActivePresetId("custom");
      setCustomizerOpen(true);
      return;
    }
    const preset = config.systemPresets.find((p) => p.id === presetId);
    if (!preset) return;
    setActivePresetId(presetId);
    // 内置预设不带经纪人筛选 → 切换时清空，保持「预设=整套视图」语义一致
    setBrokerSel(EMPTY_BROKER_SEL);
    if (preset.appliesFilter) {
      setFilters((f) => ({ ...f, ...preset.appliesFilter }));
    }
    if (preset.keys) {
      const saved = readSavedCols(config, presetId);
      setVisibleKeys(saved ?? preset.keys);
    }
    if (config.kpiMode === "client") {
      setKpiKeys(loadKpiKeys(config, presetId));
    }
  }

  function handleCustomizerConfirm(keys: TKey[]): void {
    setVisibleKeys(keys);
    saveCols(config, activePresetId, keys);
  }

  function applyDataSource(ds: "all" | "today" | "history"): void {
    setFilters((f) => ({ ...f, data_source: ds }));
    if (config.dataSourceColumnPresets) {
      setVisibleKeys(config.dataSourceColumnPresets[ds]);
    }
  }

  function applyUserPreset(p: UserColumnPreset): void {
    setActiveUserPresetId(p.id);
    setActivePresetId("custom");
    setVisibleKeys(p.columns as TKey[]);
    // 抖音用 project 字段；快手用 product 字段（保存时混存于同 project 列）
    setFilters((f) =>
      config.id === "kuaishou"
        ? { ...f, product: p.project ?? "all" }
        : { ...f, project: p.project ?? "all" },
    );
    // 恢复预设保存的经纪人筛选（无则清空）
    setBrokerSel(p.brokerFilter ?? EMPTY_BROKER_SEL);
  }

  async function saveAsNewPreset(columns?: TKey[]): Promise<void> {
    setPendingSaveColumns(columns ?? visibleKeys);
    setSavePromptOpen(true);
  }

  async function doSaveAsNewPreset(name: string): Promise<void> {
    const cols = pendingSaveColumns ?? visibleKeys;
    const res = await fetch("/api/column-presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: config.id,
        name,
        columns: cols,
        project: filters.project ?? filters.product ?? "all",
        brokerFilter: brokerActive ? brokerSel : null,
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
    setActivePresetId("custom");
    setPendingSaveColumns(null);
    toast.success(`预设「${preset.name}」已保存`);
  }

  async function updateCurrentPreset(columns?: TKey[]): Promise<void> {
    if (!activeUserPresetId) return;
    const cols = columns ?? visibleKeys;
    const res = await fetch(`/api/column-presets/${activeUserPresetId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        columns: cols,
        project: filters.project ?? filters.product ?? "all",
        brokerFilter: brokerActive ? brokerSel : null,
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
      applyPreset(config.defaultSystemPresetId);
    }
    toast.success(`预设「${name}」已删除`);
  }

  function persistKpi(presetId: string, keys: TKey[]): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(kpiStorageKey(config, presetId), JSON.stringify(keys));
    } catch {
      /* ignore */
    }
  }
  function removeKpi(key: TKey): void {
    const next = kpiKeys.filter((k) => k !== key);
    setKpiKeys(next);
    persistKpi(activePresetId, next);
  }
  function addKpis(keys: TKey[]): void {
    const next = [...kpiKeys, ...keys.filter((k) => !kpiKeys.includes(k))];
    setKpiKeys(next);
    persistKpi(activePresetId, next);
  }
  function resetKpis(): void {
    const def = (config.defaultKpiKeysFor?.(activePresetId) ?? []) as TKey[];
    setKpiKeys(def);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(kpiStorageKey(config, activePresetId));
      } catch {
        /* ignore */
      }
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  function renderCellNode(
    c: ColumnDef<TKey>,
    r: TRow,
  ): {
    display: ReactNode;
    rawNumber: number | null;
  } {
    if (c.fmt === "anchor_info") {
      return {
        display: config.renderAnchorInfo(r, () => setSelectedRow(r)),
        rawNumber: null,
      };
    }
    const custom = config.renderCell?.(c, r);
    if (custom !== undefined) {
      // platform 自定义渲染：raw 数值仍尝试取出（用于 row-level compare）
      const v = (r as Record<string, unknown>)[c.key as string];
      const num = typeof v === "number" ? v : null;
      return { display: custom, rawNumber: num };
    }
    // 默认 fmt 渲染
    const v = (r as Record<string, unknown>)[c.key as string];
    const display = formatCellByFmt(v, c.fmt);
    const num = typeof v === "number" ? v : null;
    return { display, rawNumber: num };
  }

  const isRange = filters.date_from !== filters.date_to;
  const showRowCompare = config.compareMode === "row+kpi" && showCompare;
  const FiltersComponent = config.FiltersComponent;
  const Drawer = config.DrawerComponent;
  const kpiColumns = useMemo(
    () =>
      kpiKeys
        .map((k) => config.allColumns.find((c) => c.key === k))
        .filter((c): c is ColumnDef<TKey> => !!c),
    [kpiKeys, config.allColumns],
  );

  return (
    <div className="min-w-0 max-w-full space-y-3">
      <DataToolbar
        // relative z-30：建立高于 sticky 表头(z-20)的 stacking context，
        // 否则经纪人下拉浮层会被表头穿透遮挡
        className="relative z-30"
        filters={
          <FiltersComponent
            filters={filters}
            onChange={setFilters}
            brokerOptions={brokerOptions}
            brokerSel={brokerSel}
            onBrokerChange={setBrokerSel}
          />
        }
        actions={
          <>
            {config.compareMode !== "none" && (
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground select-none">
                <input
                  type="checkbox"
                  checked={showCompare}
                  onChange={(e) => setShowCompare(e.target.checked)}
                  className="size-3.5 cursor-pointer accent-primary"
                />
                显示同比
              </label>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => config.exportCsv(sortedRows, visibleColumns)}
              disabled={sortedRows.length === 0}
            >
              导出 CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCustomizerOpen(true)}
              className="gap-1"
            >
              <Settings2 className="h-3.5 w-3.5" />
              自定义列
            </Button>
            {config.kpiPickerEnabled && (
              <Button size="sm" variant="outline" onClick={() => setKpiPickerOpen(true)}>
                KPI
              </Button>
            )}
          </>
        }
      />

      <PresetToolbar label={config.systemPresetLabel ?? "预设:"}>
        {config.systemPresets.map((p) => (
          <PresetChip
            key={p.id}
            active={activePresetId === p.id && activeUserPresetId === null}
            onClick={() => {
              setActiveUserPresetId(null);
              applyPreset(p.id);
            }}
          >
            {p.label}
          </PresetChip>
        ))}
        {config.userPresetsEnabled && userPresets.length > 0 && <PresetToolbar.Divider />}
        {config.userPresetsEnabled &&
          userPresets.map((p) => (
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
                onClick={() => setDeleteConfirm({ id: p.id, name: p.name })}
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

      {config.dataSourceEnabled && (
        <PresetToolbar label="数据:">
          <PresetChip
            active={(filters.data_source ?? "all") === "all"}
            onClick={() => applyDataSource("all")}
          >
            全部
          </PresetChip>
          <PresetChip
            active={filters.data_source === "history"}
            onClick={() => applyDataSource("history")}
          >
            历史权威
          </PresetChip>
          <PresetChip
            active={filters.data_source === "today"}
            onClick={() => applyDataSource("today")}
          >
            今日实时
          </PresetChip>
        </PresetToolbar>
      )}

      <KpiGrid items={kpiItems} />

      {config.kpiPickerEnabled && (
        <KpiPicker
          open={kpiPickerOpen}
          onOpenChange={setKpiPickerOpen}
          excluded={kpiKeys as never}
          onAdd={(keys) => addKpis(keys as TKey[])}
          onReset={resetKpis}
        />
      )}

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
          主播 <strong className="text-foreground">{baseRows.length}</strong>
          {brokerActive && rows.length !== baseRows.length ? (
            <span className="text-muted-foreground/60"> / {rows.length}</span>
          ) : null}
        </span>
        <span>
          列数 <strong className="text-foreground">{visibleColumns.length}</strong>
        </span>
        {compareLoading && showCompare && (
          <span className="text-muted-foreground/70">同比后台加载中...</span>
        )}
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
                {visibleColumns.map((c) => {
                  const active = sortKey === c.key;
                  return (
                    <TableHead
                      key={c.key as string}
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
                pagedRows.map((r, idx) => {
                  const rowKeyVal = String(
                    (r as Record<string, unknown>)[config.rowKey as string] ?? idx,
                  );
                  return (
                    <TableRow
                      key={rowKeyVal}
                      onClick={config.rowClickOpensDrawer ? () => setSelectedRow(r) : undefined}
                      className={cn(
                        "group hover:bg-[var(--hover-bg)]",
                        config.rowClickOpensDrawer && "cursor-pointer",
                      )}
                    >
                      {visibleColumns.map((c) => {
                        const { display, rawNumber } = renderCellNode(c, r);
                        const isAnchorInfo = c.fmt === "anchor_info";
                        const isNumeric =
                          c.fmt === "number" || c.fmt === "duration" || c.fmt === "percent";
                        const enableCompare = showRowCompare && isNumeric && rawNumber !== null;
                        const prev = enableCompare ? prevByKey.get(rowKeyVal) : undefined;
                        const prevValRaw = prev
                          ? ((prev as Record<string, unknown>)[c.key as string] as unknown)
                          : null;
                        const prevVal = typeof prevValRaw === "number" ? prevValRaw : null;
                        const compare = enableCompare
                          ? formatCompare(rawNumber as number, prevVal, periodDays)
                          : null;
                        const isMutedDisplay = typeof display === "string" && display === "—";
                        return (
                          <TableCell
                            key={c.key as string}
                            className={cn(
                              isAnchorInfo
                                ? "px-3 py-2 w-[220px] max-w-[220px]"
                                : "px-3 py-3 text-sm whitespace-nowrap",
                              c.align === "right" && "text-right tabular-nums",
                              c.sticky &&
                                "sticky left-0 bg-card transition-colors group-hover:bg-[var(--hover-bg)]",
                              c.bold && "font-semibold",
                              isMutedDisplay && "text-muted-foreground",
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
                  );
                })
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

      <ColumnCustomizer<TKey>
        open={customizerOpen}
        onOpenChange={setCustomizerOpen}
        selectedKeys={visibleKeys}
        onConfirm={handleCustomizerConfirm}
        activeUserPresetName={
          activeUserPresetId !== null
            ? (userPresets.find((p) => p.id === activeUserPresetId)?.name ?? null)
            : null
        }
        onUpdatePreset={config.userPresetsEnabled ? (keys) => updateCurrentPreset(keys) : undefined}
        onSaveAsNewPreset={config.userPresetsEnabled ? (keys) => saveAsNewPreset(keys) : undefined}
        allColumns={config.allColumns}
        groups={config.customizerGroups}
        groupSections={config.customizerGroupSections}
        getColumnsByGroup={config.getColumnsByGroup}
        getColumnsBySubGroup={config.getColumnsBySubGroup}
      />

      <Drawer
        row={selectedRow}
        filters={filters}
        visibleColumns={visibleColumns}
        kpiColumns={kpiColumns}
        onOpenChange={(open) => {
          if (!open) setSelectedRow(null);
        }}
      />

      {config.userPresetsEnabled && (
        <>
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
        </>
      )}
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function colsStorageKey<TKey extends string, TRow>(
  config: PlatformConfig<TKey, TRow>,
  presetId: string,
): string {
  return config.colsByPreset
    ? `${config.storageKeyPrefix}${presetId}`
    : `${config.storageKeyPrefix}shared`;
}

function kpiStorageKey<TKey extends string, TRow>(
  config: PlatformConfig<TKey, TRow>,
  presetId: string,
): string {
  // KPI 永远 by preset
  return `anchor_kpi_v1_${config.id}_${presetId}`;
}

function readSavedCols<TKey extends string, TRow>(
  config: PlatformConfig<TKey, TRow>,
  presetId: string,
): TKey[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(colsStorageKey(config, presetId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const validKeys = new Set(
      config.allColumns.filter((c) => !c.pinned).map((c) => c.key as string),
    );
    const filtered = (parsed as string[]).filter((k) => validKeys.has(k));
    return filtered.length > 0 ? (filtered as TKey[]) : null;
  } catch {
    return null;
  }
}

function saveCols<TKey extends string, TRow>(
  config: PlatformConfig<TKey, TRow>,
  presetId: string,
  keys: TKey[],
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(colsStorageKey(config, presetId), JSON.stringify(keys));
  } catch {
    /* ignore */
  }
}

function loadVisibleKeys<TKey extends string, TRow>(
  config: PlatformConfig<TKey, TRow>,
  presetId: string,
): TKey[] {
  const saved = readSavedCols(config, presetId);
  if (saved) return saved;
  // 默认：用 systemPreset.keys 或 defaultVisibleKeys
  const preset = config.systemPresets.find((p) => p.id === presetId);
  return (preset?.keys ?? config.defaultVisibleKeys) as TKey[];
}

function loadKpiKeys<TKey extends string, TRow>(
  config: PlatformConfig<TKey, TRow>,
  presetId: string,
): TKey[] {
  if (config.kpiMode !== "client") return [];
  const def = (config.defaultKpiKeysFor?.(presetId) ?? []) as TKey[];
  if (typeof window === "undefined") return def;
  try {
    const raw = window.localStorage.getItem(kpiStorageKey(config, presetId));
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      const valid = new Set(config.allColumns.map((c) => c.key as string));
      const filtered = parsed.filter((k) => valid.has(k));
      if (filtered.length > 0) return filtered as TKey[];
    }
  } catch {
    /* fallthrough */
  }
  return def;
}

function uniqueKeys<TKey extends string>(keys: TKey[]): TKey[] {
  return [...new Set(keys)];
}

function appendFieldParams(sp: URLSearchParams, keys: string[]): void {
  if (keys.length === 0) return;
  sp.set("fields", keys.join(","));
}

function aggregate<TRow, TKey extends string>(
  rs: TRow[],
  key: TKey,
  fmt: ColumnDef<TKey>["fmt"],
): number {
  const get = (r: TRow): unknown => (r as Record<string, unknown>)[key as string];
  if (fmt === "percent") {
    const vals = rs.map((r) => Number(get(r) ?? NaN)).filter((n) => Number.isFinite(n));
    if (vals.length === 0) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return rs.reduce((acc, r) => acc + (Number(get(r) ?? 0) || 0), 0);
}

function getSortVal<TKey extends string, TRow>(
  config: PlatformConfig<TKey, TRow>,
  r: TRow,
  key: TKey,
): string | number | null {
  if (config.getSortValue) return config.getSortValue(r, key);
  const v = (r as Record<string, unknown>)[key as string];
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number" || typeof v === "string") return v;
  return v == null ? null : String(v);
}

function formatCellByFmt(v: unknown, fmt: ColumnDef["fmt"]): string {
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
    return `${(v * 100).toFixed(2)}%`;
  }
  if (fmt === "timestamp") {
    if (typeof v !== "number" || v === 0) return "—";
    const ms = v > 1e10 ? v : v * 1000;
    return new Date(ms).toLocaleDateString("zh-CN");
  }
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
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
