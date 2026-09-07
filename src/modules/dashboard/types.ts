/**
 * Dashboard 业务看板类型定义。
 * 业务规则见 ~/Documents/Obsidian Vault/qjhr-pro/业务字典.md
 */

/** 项目维度 */
export const PROJECT_KEYS = ["ddz", "three", "zhaohua"] as const;
export type ProjectKey = (typeof PROJECT_KEYS)[number];

export const PROJECT_LABELS: Record<ProjectKey, string> = {
  ddz: "斗地主",
  three: "三国冰河时代",
  zhaohua: "造化仙府",
};

export const ZHAOHUA_RECRUIT_BROKER_NAME = "造化仙府";

/** 分组维度（按运营经纪人所在钉钉部门 alias 派生） */
export type GroupKey = "all" | "online" | "offline" | "other";

/** Section 1 KPI metric（5 个核心 KPI，跟 Section 2 解耦） */
export type Section1Metric =
  | "total_fan_ticket"
  | "flow"
  | "active_anchor_count"
  | "new_anchor_count"
  | "first_live_anchor_count";

/**
 * Section 2 metric（9 个，按 project 公式分支）。
 * - total_fan_ticket    音浪（SUM(total_fan_ticket) from anchor_daily）
 * - flow                流水（斗地主/造化仙府 cps_all 全 scene 派生 / 三国 minigame before_divided）
 * - active_anchor_count 开播主播数（DISTINCT anchor_id WHERE live_duration_1d > 0）
 * - new_anchor_count    新入驻主播数（COUNT WHERE join_time IN range from anchor_profile）
 * - live_flow           直播流水（斗地主/造化仙府 cps_all + scene=live 派生 / 三国 minigame before_divided）
 * - video_flow          短视频流水（斗地主/造化仙府 cps_all + scene=video 派生 / 三国 暂为 0）
 * - install_or_activate 安装·激活（斗地主/造化仙府 cps 安装 ucnt / 三国 minigame gm_active_ucnt）
 * - show_uv             曝光人数（统一 anchor_portrait_daily.show_uv）
 * - watch_uv            进直播间 UV（统一 anchor_portrait_daily.watch_uv）
 */
export type Section2Metric =
  | "total_fan_ticket"
  | "flow"
  | "active_anchor_count"
  | "new_anchor_count"
  | "first_live_anchor_count"
  | "live_flow"
  | "video_flow"
  | "install_or_activate"
  | "show_uv"
  | "watch_uv";

/**
 * 抽屉展示用：所有 KPI metric（9 个，等同 Section2Metric — Section 2 已覆盖 Section 1 的 4 个）。
 * 保留独立类型 alias 以维持调用点语义清晰。
 */
export type DrawerMetric = Section2Metric;

export interface CoreKpiValue {
  /** 当前周期 */
  current: number;
  /** 昨日同期 */
  prev_day: number | null;
  /** 上周同期 */
  prev_week: number | null;
  /** 近 14 天按天序列（与所选区间无关，KPI 卡走势小图用），缺日补 0 */
  trend?: number[];
}

export interface CoreKpiResponse {
  total_fan_ticket: CoreKpiValue;
  flow: CoreKpiValue;
  active_anchor_count: CoreKpiValue;
  new_anchor_count: CoreKpiValue;
  first_live_anchor_count: CoreKpiValue;
}

export interface GroupCellValue {
  project: ProjectKey;
  group: GroupKey;
  value: number;
  /** 上一对比周期原值，用于展示精确差值 */
  prev_value: number | null;
  vs_prev: number | null;
  anchor_count: number;
  /** 区间内同时有开播时长和小游戏开播时长的主播数（挂摇杆） */
  rod_anchor_count?: number;
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
    zhaohua: ProjectBreakdown;
  }[];
}

/** 抽屉详情入参（带 metric — 用于驱动「达成主播列表」的排序口径） */
export interface DrawerDetailFilters {
  project?: ProjectKey;
  group?: GroupKey;
  date_from: string;
  date_to: string;
  /** 当前选中的 KPI（驱动 top_anchors 字段/排序），未传时默认 total_fan_ticket */
  metric?: DrawerMetric;
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

/**
 * 抽屉「达成主播列表」单行。
 *
 * - first_live_anchor_count → metric_value = first_live_time_in_faction（unix s），display_date = "YYYY-MM-DD" 首播日
 * - new_anchor_count        → metric_value = join_time（unix s），display_date = "YYYY-MM-DD" 入会日
 * - active_anchor_count     → metric_value = 开播天数（实数）
 * - 其他（音浪 / 各类流水 / 安装·激活 / 曝光·UV）→ metric_value = 该指标的当周期累计值
 */
export interface DrawerTopAnchor {
  anchor_id: string;
  nick_name: string;
  avatar: string | null;
  aweme_display_id: string | null;
  broker_name: string | null;
  /** 主排序值（数值或 timestamp） */
  metric_value: number;
  /** 显示用的次要文字（首播日期 / 入会日期等，已格式化为 "YYYY-MM-DD"）*/
  display_date?: string;
}

export interface DrawerDetailResponse {
  title: string;
  /** 9 个 KPI（4 Section 1 + 5 Section 2） */
  kpis: DrawerKpiBlock[];
  /** 当前周期日明细 */
  daily_rows: DrawerDailyRow[];
  /** 前一周期日明细（按日 offset 对齐） */
  prev_daily_rows: DrawerDailyRow[];
  /** 按当前 metric 排序的达成主播列表（首次开播 / 新入驻 → 全量；其他 → Top 20）*/
  top_anchors: DrawerTopAnchor[];
  /** 总达成主播数（用于「查看全部 N 个」按钮显示）*/
  total_anchors: number;
}
