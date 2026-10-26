import { ALL_COLUMNS, ALL_GROUPS } from "@/modules/anchors";
import { BUYU_REPORT_COLUMNS, BUYU_PERCENT_COLUMNS, BUYU_MONEY_COLUMNS } from "@/modules/buyu";
import { DOUYIN_METRIC_META } from "./douyin-meta";

export interface GoalMetricOption {
  key: string;
  label: string;
  group: string;
  subGroup?: string;
  unit: string;
  kind: "sum" | "count" | "ratio";
  selectable: boolean;
  note: string;
  direction: "gte" | "lte";
}
const computed = new Set([
  "controller_total_amount",
  "minigame_total_amount",
  "g_total_amount",
  "g_promote_active_amount",
  "v_total_amount",
  "v_promote_active_amount",
]);
export const DOUYIN_GOAL_GROUPS = [...ALL_GROUPS];
export const DOUYIN_GOAL_METRICS: GoalMetricOption[] = ALL_COLUMNS.filter((c) => !c.pinned).map(
  (c) => {
    const numeric = ["number", "duration", "percent"].includes(c.fmt);
    const query = DOUYIN_METRIC_META[c.key];
    const money = /流水|收入|分账|分成收入|付费金额|分成\(分成后\)|道具分成|充值流水/.test(c.label);
    const unit =
      c.fmt === "percent"
        ? "%"
        : c.fmt === "duration"
          ? "小时"
          : /\(s\)$/.test(c.label)
            ? "秒"
            : /音浪/.test(c.label)
              ? "音浪"
              : money
                ? "元"
                : /天/.test(c.label)
                  ? "天"
                  : /人数|用户|玩家|UV|ACU|PCU|粉丝|关注|涨粉|人气|feed_acu/.test(c.label)
                    ? "人"
                    : /时长/.test(c.label)
                      ? "小时"
                      : /分$/.test(c.label)
                        ? "分"
                        : "次";
    const known = !!query || computed.has(c.key);
    return {
      key: c.key,
      label: c.label,
      group: c.group,
      subGroup: c.subGroup,
      unit,
      kind:
        c.fmt === "percent"
          ? "ratio"
          : query?.additive && (unit === "人" || unit === "次" || unit === "天")
            ? "count"
            : "sum",
      selectable: numeric && known,
      direction: "gte",
      note: !numeric
        ? "信息字段，不适合作为数值目标"
        : !known
          ? "该字段暂未配置目标统计口径"
          : query && !query.additive
            ? "同主播明细的单主播口径；请选择一个主播，避免跨主播平均比率或峰值"
            : /UV|人数|用户|玩家/.test(c.label)
              ? "同主播明细按日累计口径；不代表整周期去重人数"
              : "同主播明细字段，按选定周期及账号范围统计",
    };
  },
);
export const BUYU_GOAL_GROUPS = ["投流规模", "付费与成本", "ROI", "留存", "自然量", "账号达标"];
export const BUYU_GOAL_METRICS: GoalMetricOption[] = BUYU_REPORT_COLUMNS.map((label) => ({
  key: label,
  label,
  group: label.includes("自然量")
    ? "自然量"
    : label.includes("ROI")
      ? "ROI"
      : label.includes("留")
        ? "留存"
        : label.includes("付费") || label === "总CPI"
          ? "付费与成本"
          : "投流规模",
  unit: BUYU_PERCENT_COLUMNS.has(label) ? "%" : BUYU_MONEY_COLUMNS.has(label) ? "元" : "人",
  kind: BUYU_PERCENT_COLUMNS.has(label) ? "ratio" : BUYU_MONEY_COLUMNS.has(label) ? "sum" : "count",
  selectable: true,
  direction: label === "总CPI" || label === "首日付费成本" ? "lte" : "gte",
  note: "来自捕鱼直播·投流日志；优先使用匹配月份的报表汇总，跨月比率不直接相加或平均",
}));
BUYU_GOAL_METRICS.push({
  key: "qualified_accounts",
  label: "达标账号数",
  group: "账号达标",
  unit: "个",
  kind: "count",
  selectable: true,
  direction: "gte",
  note: "按选定产品的月汇总实时净ROI及最低消耗判断；账号去重，不含外部账号，未知ROI单列",
});
export function goalMetrics(source: "douyin" | "buyu") {
  return source === "douyin" ? DOUYIN_GOAL_METRICS : BUYU_GOAL_METRICS;
}
export function metricOption(source: "douyin" | "buyu", key: string) {
  return goalMetrics(source).find((m) => m.key === key);
}
/** Virtual goal scope only; stored crawler dataset IDs remain unchanged. */
export const BUYU_TOTAL_PRODUCT = "product_buyu_all";
export const BUYU_SOURCE_PRODUCTS = [
  { id: "product_buyu", name: "3D" },
  { id: "product_ue4", name: "UE4" },
  { id: "product_urp", name: "URP" },
] as const;
export function buyuProductIds(product: string): string[] {
  return product === BUYU_TOTAL_PRODUCT
    ? BUYU_SOURCE_PRODUCTS.map((p) => p.id)
    : BUYU_SOURCE_PRODUCTS.some((p) => p.id === product)
      ? [product]
      : [];
}
export const SOURCE_PRODUCTS = {
  douyin: [
    { id: "ddz", name: "斗地主" },
    { id: "three", name: "三冰" },
    { id: "zhaohua", name: "造化" },
  ],
  buyu: [{ id: BUYU_TOTAL_PRODUCT, name: "总盘（3D / UE4 / URP）" }, ...BUYU_SOURCE_PRODUCTS],
};

/** Monthly allocation is meaningful only for additive measures. */
export function isAdditiveMetric(source: "douyin" | "buyu", field: string): boolean {
  return source === "douyin"
    ? DOUYIN_METRIC_META[field]?.additive === true || computed.has(field)
    : ["消耗", "新增", "自然量新增"].includes(field);
}
