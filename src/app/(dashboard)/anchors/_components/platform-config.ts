import type { ComponentType, ReactNode } from "react";
import type { ColumnDef } from "./column-presets";

/**
 * 通用 anchor table 的筛选 state shape。
 * 各 platform 可只用其中一部分（抖音 project；快手 product+data_source）。
 * shape 是并集，便于在 GenericAnchorTable 内统一持有 + URL 同步。
 */
export interface AnchorFilters {
  date_from: string;
  date_to: string;
  search?: string;
  /** 抖音项目筛选 (all/ddz/three) */
  project?: string;
  /** 快手项目筛选 (all/捕鱼大作战/...) */
  product?: string;
  /** 快手数据源 (all/today/history) */
  data_source?: "all" | "today" | "history";
}

/** parseApiResponse 的统一返回 shape — 不同 platform 用不同子集 */
export interface ParsedAnchorResponse<TRow> {
  rows: TRow[];
  /** row-level 同比（抖音）：按 rowKey join 出前一周期数据 */
  previousRows?: TRow[];
  /** 周期天数（前后期对比文案用） */
  days?: number;
  /** server-side 聚合 KPI（快手 API 直接返回） */
  serverKpi?: Record<string, number>;
}

/** 系统预设（顶部 chip） */
export interface SystemPreset<TKey extends string> {
  id: string;
  label: string;
  /** 切到此 preset 时同步设置的可见列；不填表示不改列（如快手 product chip） */
  keys?: TKey[];
  /** 切到此 preset 时同步写入 filters 的字段（抖音 ddz→project=ddz；快手电玩捕鱼→product=电玩捕鱼） */
  appliesFilter?: Partial<AnchorFilters>;
}

/** Drawer 通用 props — 每个 platform 在 config 里写 wrapper 适配自家 drawer */
export interface DrawerCommonProps<TRow, TKey extends string> {
  row: TRow | null;
  filters: AnchorFilters;
  visibleColumns: ColumnDef<TKey>[];
  kpiColumns: ColumnDef<TKey>[];
  onOpenChange: (open: boolean) => void;
}

/** server-mode KPI 直接返回 ReactNode 列表 */
export interface KpiItemSpec {
  key: string;
  label: string;
  value: ReactNode;
  footer?: ReactNode;
}

export interface PlatformConfig<TKey extends string, TRow> {
  /** 平台标识 — 用于 user_preset 表 + storage key */
  id: "douyin" | "kuaishou";
  label: string;

  /** 行主键字段名（抖音 anchor_id / 快手 id），React key + previousRows join 用 */
  rowKey: keyof TRow & string;

  /** API URL — fetch(`${apiEndpoint}?...`) */
  apiEndpoint: string;

  /** 全量列定义（含 pinned） */
  allColumns: ColumnDef<TKey>[];
  /** Pinned 列（永远渲染最前，不在 customizer） */
  pinnedColumns: ColumnDef<TKey>[];
  /** ColumnCustomizer 中栏使用的分组（不含 pinned 组） */
  customizerGroups: string[];
  getColumnsByGroup: (group: string) => ColumnDef<TKey>[];
  getColumnsBySubGroup: (
    group: string,
  ) => { subGroup: string | null; columns: ColumnDef<TKey>[] }[];

  /** 默认显示的列（不含 pinned） */
  defaultVisibleKeys: TKey[];
  /** 默认排序 */
  defaultSort: { key: TKey; dir: "asc" | "desc" };

  /** localStorage key 前缀（visibleCols + kpiKeys 各 platform 独立） */
  storageKeyPrefix: string;
  /** 列偏好按 preset 分别存（抖音 true）；false 则共享一份（快手 — 切 product 不联动列） */
  colsByPreset: boolean;

  /** 系统预设 chip 行（抖音斗地主默认/三国默认/公会管理；快手 product 列表） */
  systemPresets: SystemPreset<TKey>[];
  defaultSystemPresetId: string;
  systemPresetLabel?: string;

  /** 用户自定义预设（DB） */
  userPresetsEnabled: boolean;

  /** KPI 模式：client = 从 rows 客户端聚合；server = parseApiResponse 给 serverKpi */
  kpiMode: "client" | "server";
  /** client 模式：当前 preset 默认 KPI keys */
  defaultKpiKeysFor?: (presetId: string) => TKey[];
  /** client 模式：是否显示 KpiPicker 弹窗 */
  kpiPickerEnabled?: boolean;
  /** server 模式：把 ServerKpi → KpiItemSpec[] */
  buildKpiItems?: (kpi: Record<string, number>) => KpiItemSpec[];

  /** 同比模式
   * - "row+kpi"：行级 + KPI 级（抖音）
   * - "kpi-only"：仅 KPI（快手）
   * - "none"：不显示 */
  compareMode: "row+kpi" | "kpi-only" | "none";

  /** 数据源 chip 行（today/history/all），仅快手 */
  dataSourceEnabled: boolean;

  /** 默认 filters 值 */
  defaultFilters: AnchorFilters;
  /** 顶部 filter UI（日期 / 搜索 / 项目 select 等） */
  FiltersComponent: ComponentType<{
    filters: AnchorFilters;
    onChange: (next: AnchorFilters) => void;
  }>;

  /** 把 GenericFilters → URLSearchParams（用于 fetch + URL replace） */
  buildApiParams: (filters: AnchorFilters) => URLSearchParams;
  /** API 响应解析 */
  parseApiResponse: (json: unknown) => ParsedAnchorResponse<TRow>;

  /** 排序值取出（默认 row[key] 强转，可覆盖处理 boolean/null/字符串状态） */
  getSortValue?: (row: TRow, key: TKey) => string | number | null;

  /** Pinned 第一格的"主播信息"渲染 — 头像 + 昵称 + 平台账号等
   * 抖音：头像+昵称+aweme_display_id+UID（点头像打开 drawer）
   * 快手：头像+account_name+platform_account_id（点整行打开 drawer）
   */
  renderAnchorInfo: (row: TRow, onSelect: () => void) => ReactNode;

  /** 非通用 cell 自定义渲染（返回 undefined 走默认 fmt 渲染）
   * 用于 platform 特殊 badge：快手 contract_expire_at / live_status / agent_name fallback 等
   */
  renderCell?: (col: ColumnDef<TKey>, row: TRow) => ReactNode | undefined;

  /** 是否整行可点（快手 yes，抖音 no — 点头像才打开） */
  rowClickOpensDrawer: boolean;

  /** 详情抽屉组件 */
  DrawerComponent: ComponentType<DrawerCommonProps<TRow, TKey>>;

  /** CSV 导出实现（platform-specific：抖音拆主播信息列；快手用 fmt 简单导出） */
  exportCsv: (rows: TRow[], visibleColumns: ColumnDef<TKey>[]) => void;

  /** 跳转主播时根据行决定切到哪个系统预设（抖音 is_threekingdoms → three / ddz）
   * 不实现表示不切预设 */
  resolvePresetForRow?: (row: TRow) => string | null;
}
