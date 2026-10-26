import { formatGoalValue, goalProgress } from "./rules";
import type { Goal } from "./types";
import { goalMetricWeights } from "./weights";

export function goalDisplayProgress(goal: Goal) {
  const partial = goal.source_result?.status === "partial";
  const available = !goal.binding || goal.source_result?.status === "ready" || partial;
  const actual = goal.actual;
  const target = goal.target;
  if (!available || !goal.confirmed || actual === null || target === null)
    return { label: goalProgress(goal).label, percent: null, partial };
  if (goal.binding?.direction === "lte")
    return {
      label: `${partial ? "已同步 " : ""}${formatGoalValue(actual, goal.unit)} / 上限 ${formatGoalValue(target, goal.unit)}`,
      percent: null,
      partial,
    };
  if (goal.kind === "ratio")
    return {
      label: `${partial ? "已同步 " : ""}${formatGoalValue(actual, goal.unit)} / 门槛 ${formatGoalValue(target, goal.unit)}`,
      percent: target > 0 ? Math.min(100, Math.max(0, (actual / target) * 100)) : null,
      partial,
    };
  const rate = target === 0 ? 100 : Math.max(0, (actual / target) * 100);
  return {
    label: `${partial ? "已同步达成率" : "达成率"} ${Number(rate.toFixed(2))}%`,
    percent: Math.min(100, rate),
    partial,
  };
}

export interface GoalGroup {
  key: string;
  project: string;
  line: string;
  items: Goal[];
  current: Goal[];
  archived: number;
  achieved: number;
  attention: number;
}

export function groupGoals(items: Goal[]): GoalGroup[] {
  const groups = new Map<string, GoalGroup>();
  for (const goal of items) {
    const key = JSON.stringify([
      goal.period,
      goal.project,
      goal.binding ? [goal.binding.source, goal.binding.product] : null,
      goal.line,
      goal.dept_id,
      goal.team_parent_id ?? null,
      goal.binding?.selection === "operators" ? "individual" : "team",
      [...new Set(goal.owner_ids)].sort(),
      [...new Set(goal.owner_labels)].sort(),
    ]);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        project: goal.project,
        line: goal.line,
        items: [],
        current: [],
        archived: 0,
        achieved: 0,
        attention: 0,
      };
      groups.set(key, group);
    }
    group.items.push(goal);
    if (goal.status === "closed") group.archived += 1;
    else {
      group.current.push(goal);
      const progress = goalProgress(goal);
      if (["已完成", "已达门槛", "符合上限"].includes(progress.label)) group.achieved += 1;
      if (progress.attention) group.attention += 1;
    }
  }
  return [...groups.values()];
}

/** Independent metric scores are capped before weighting; missing data retains its share. */
export function goalCompositeProgress(goals: Goal[]) {
  const items = goals.filter((g) => g.status !== "closed" && !g.deleted_at);
  const weights = goalMetricWeights(items);
  if (!items.length || !weights.some((w) => w > 0))
    return {
      percent: null,
      partial: false,
      label: "综合达成率待配置",
      note: "暂无参与计算的指标权重",
    };
  let sum = 0,
    available = 0,
    incomplete = 0;
  items.forEach((goal, index) => {
    const weight = weights[index] ?? 0;
    if (weight === 0) return;
    const display = goalDisplayProgress(goal);
    const valid =
      goal.confirmed &&
      goal.actual !== null &&
      goal.target !== null &&
      (goal.kind !== "ratio" || goal.target > 0) &&
      (!goal.binding ||
        goal.source_result?.status === "ready" ||
        goal.source_result?.status === "partial");
    if (!valid) {
      incomplete++;
      return;
    }
    available++;
    if (display.partial) incomplete++;
    const actual = goal.actual ?? 0,
      target = goal.target ?? 0;
    const score =
      goal.binding?.direction === "lte"
        ? actual <= target
          ? 100
          : 0
        : target === 0
          ? 100
          : Math.max(0, Math.min(100, (actual / target) * 100));
    sum += (score * weight) / 100;
  });
  const partial = incomplete > 0;
  const percent = available ? Math.round((sum + 1e-9) * 100) / 100 : null;
  return {
    percent,
    partial,
    label:
      percent === null
        ? "综合进度待同步 / 配置"
        : `${partial ? "已同步综合达成率" : "综合达成率"} ${percent}%`,
    note: partial
      ? `${incomplete}项数据待补齐或配置，未取得数据的指标暂按0贡献，保留权重`
      : "按当前指标权重汇总，单项最多计100%",
  };
}
