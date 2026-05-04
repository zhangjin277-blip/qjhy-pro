/**
 * Dashboard 业务看板类型定义。
 * 业务规则见 ~/Documents/Obsidian Vault/qjhr-pro/业务字典.md
 */

/** 项目维度 */
export type ProjectKey = "ddz" | "three";

/** 分组维度（按运营经纪人所在钉钉部门 alias 派生） */
export type GroupKey = "all" | "online" | "offline" | "other";

/** Section 1 KPI metric（4 个核心 KPI，跟 Section 2 解耦） */
export type Section1Metric =
  | "total_fan_ticket"
  | "flow"
  | "active_anchor_count"
  | "new_anchor_count";

/**
 * Section 2 metric（5 个，按 project 公式分支）。
 * - live_flow         直播流水（斗地主 cps_all + scene=live 派生 / 三国 minigame before_divided）
 * - video_flow        短视频流水（斗地主 cps_all + scene=video 派生 / 三国 暂为 0）
 * - install_or_activate 安装·激活（斗地主 cps 安装 ucnt / 三国 minigame gm_active_ucnt）
 * - show_uv           曝光人数（统一 anchor_portrait_daily.show_uv）
 * - watch_uv          进直播间 UV（统一 anchor_portrait_daily.watch_uv）
 */
export type Section2Metric =
  | "live_flow"
  | "video_flow"
  | "install_or_activate"
  | "show_uv"
  | "watch_uv";

/** 抽屉展示用：所有 KPI metric（4 Section 1 + 5 Section 2 = 9） */
export type DrawerMetric = Section1Metric | Section2Metric;

export interface CoreKpiValue {
  /** 当前周期 */
  current: number;
  /** 昨日同期 */
  prev_day: number | null;
  /** 上周同期 */
  prev_week: number | null;
}

export interface CoreKpiResponse {
  total_fan_ticket: CoreKpiValue;
  flow: CoreKpiValue;
  active_anchor_count: CoreKpiValue;
  new_anchor_count: CoreKpiValue;
}

export interface GroupCellValue {
  project: ProjectKey;
  group: GroupKey;
  value: number;
  vs_prev: number | null;
  anchor_count: number;
  sparkline: number[];
  /** 是否「不适用」（如三国 video_flow）。true 时 cell 渲染为 "—" */
  not_applicable?: boolean;
}

export interface ProjectBreakdown {
  project: ProjectKey;
  total: GroupCellValue;
  online: GroupCellValue;
  offline: GroupCellValue;
  other: GroupCellValue;
}

export interface DashboardOverviewResponse {
  date_from: string;
  date_to: string;
  core: CoreKpiResponse;
  breakdown: {
    metric: Section2Metric;
    ddz: ProjectBreakdown;
    three: ProjectBreakdown;
  }[];
}

/** 抽屉详情入参（不再带 metric — 抽屉内自由切换） */
export interface DrawerDetailFilters {
  project?: ProjectKey;
  group?: GroupKey;
  date_from: string;
  date_to: string;
}

export interface DrawerKpiBlock {
  /** metric key（用于 selectedKey 联动） */
  key: DrawerMetric;
  label: string;
  value: number;
  /** 单位标签：人 / h / 中文缩写 */
  unit?: string;
  vs_prev: number | null;
  /** 为 true 时表示「不适用」（如三国 + video_flow），UI 显示 "—" */
  not_applicable?: boolean;
}

export interface DrawerDailyRow {
  date: string;
  /** 9 个指标的当日值 */
  values: Partial<Record<DrawerMetric, number | null>>;
}

export interface DrawerDetailResponse {
  title: string;
  /** 9 个 KPI（4 Section 1 + 5 Section 2） */
  kpis: DrawerKpiBlock[];
  /** 当前周期日明细 */
  daily_rows: DrawerDailyRow[];
  /** 前一周期日明细（按日 offset 对齐） */
  prev_daily_rows: DrawerDailyRow[];
}
