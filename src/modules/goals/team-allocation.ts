import type { Goal, GoalDefinition, GoalBinding, GoalQualification } from "./types";
import { isAdditiveMetric } from "./catalog";
import { fail } from "./rules";

export function sameTeamMetric(a: GoalDefinition, b: GoalDefinition) {
  return (
    a.metric === b.metric &&
    a.unit === b.unit &&
    a.kind === b.kind &&
    a.binding?.source === b.binding?.source &&
    a.binding?.product === b.binding?.product &&
    a.binding?.field === b.binding?.field
  );
}

export function supportsTeamSplit(goal: GoalDefinition) {
  // Monthly qualified accounts can be divided across disjoint operator account sets.
  // They are not additive across months: the same account may qualify more than once.
  const monthlyQualifiedAccounts =
    goal.binding?.source === "buyu" &&
    goal.binding.field === "qualified_accounts" &&
    goal.kind === "count" &&
    !goal.period.includes("Q");
  return (
    !!goal.binding &&
    !goal.team_parent_id &&
    goal.binding.selection !== "operators" &&
    goal.binding.direction === "gte" &&
    goal.kind !== "ratio" &&
    (isAdditiveMetric(goal.binding.source, goal.binding.field) || monthlyQualifiedAccounts)
  );
}

/** 捕鱼的消耗属于可按账号拆分的累计目标；其他项目仍按运营合计填写。 */
export function supportsAccountTargetSplit(goal: GoalDefinition) {
  return (
    goal.binding?.source === "buyu" &&
    goal.binding.field === "消耗" &&
    goal.kind === "sum" &&
    !goal.team_parent_id
  );
}

export function personalDefinition(
  parent: Goal,
  ownerId: string,
  target: number,
  representative: string,
): GoalDefinition {
  if (!parent.binding) fail("请选择绑定业务指标的团队目标");
  return {
    period: parent.period,
    project: parent.project,
    line: parent.line,
    dept_id: parent.dept_id,
    owner_ids: [ownerId],
    owner_labels: [],
    metric: parent.metric,
    unit: parent.unit,
    kind: parent.kind,
    target,
    weight: parent.weight ?? null,
    definition: parent.definition,
    confirmed: parent.confirmed,
    parent_id: null,
    team_parent_id: representative,
    binding: {
      ...parent.binding,
      selection: "operators",
      account_ids: [],
      account_snapshot_at: null,
    },
  };
}

/** JSONB and schema parsing may reorder keys; inherited conditions are compared by value. */
function sameQualification(
  a: GoalQualification | null | undefined,
  b: GoalQualification | null | undefined,
) {
  return a === b || (!!a && !!b && a.roi === b.roi && a.min_cost === b.min_cost);
}
function sameProductQualifications(
  a: GoalBinding["qualification_by_product"],
  b: GoalBinding["qualification_by_product"],
) {
  if (!a || !b) return a === b;
  const products = Object.keys(a);
  return (
    products.length === Object.keys(b).length &&
    products.every((product) => sameQualification(a[product], b[product]))
  );
}

export function validateTeamAllocation(
  child: GoalDefinition,
  parent: Goal,
  siblings: GoalDefinition[],
) {
  if (!supportsTeamSplit(parent))
    fail("该团队指标暂不支持拆分，均值、峰值、比率和上限指标需独立设置");
  if (
    child.period !== parent.period ||
    child.project !== parent.project ||
    child.dept_id !== parent.dept_id ||
    !sameTeamMetric(child, parent)
  )
    fail("个人目标须与团队使用相同周期、项目、部门及指标");
  if (child.owner_ids.length !== 1 || child.binding?.selection !== "operators")
    fail("个人目标须选择一位运营并自动匹配账号");
  if (
    child.definition !== parent.definition ||
    child.binding.direction !== parent.binding?.direction ||
    !sameQualification(child.binding.qualification, parent.binding?.qualification) ||
    !sameProductQualifications(
      child.binding.qualification_by_product,
      parent.binding?.qualification_by_product,
    )
  )
    fail("个人目标须沿用团队的统计口径和达成条件");
  if (siblings.some((g) => g.owner_ids.some((id) => child.owner_ids.includes(id))))
    fail("该运营已有本团队的同指标个人目标，请调整已有目标");
  if (child.target === null || parent.target === null) fail("请先设置团队与个人目标值");
  if (siblings.reduce((sum, g) => sum + (g.target ?? 0), child.target) > parent.target + 1e-8)
    fail(`${child.metric}：个人分配总额超过团队目标`);
}
