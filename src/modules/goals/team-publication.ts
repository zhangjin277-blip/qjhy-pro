import type { Goal, GoalAccess } from "./types";
import { canManageTeamGoals, fail, inGoalScope, requireGoalPoint } from "./rules";
import { sameTeamMetric } from "./team-allocation";

export function pendingTeamMetricGoals(root: Goal, team: Goal[], children: Goal[]) {
  const teamIds = new Set(team.map((g) => g.id));
  return children.filter(
    (g) =>
      g.team_parent_id &&
      teamIds.has(g.team_parent_id) &&
      !g.deleted_at &&
      g.status === "draft" &&
      sameTeamMetric(g, root),
  );
}
/** Check the complete pending set before any write; never publish a newly added draft unseen. */
export function teamPublicationPlan(
  actor: GoalAccess,
  root: Goal,
  team: Goal[],
  children: Goal[],
  request: { goal: { id: string; version: number }; children: { id: string; version: number }[] },
) {
  requireGoalPoint(actor, "publish");
  if (!canManageTeamGoals(actor) || !inGoalScope(actor, root)) fail("无权发布团队及个人目标", 403);
  if (root.id !== request.goal.id || root.version !== request.goal.version)
    fail("团队指标已变化，请刷新后重新确认", 409);
  if (
    root.deleted_at ||
    root.team_parent_id ||
    root.binding?.selection === "operators" ||
    root.status === "closed"
  )
    fail("请选择未归档的团队指标");
  const pending = pendingTeamMetricGoals(root, team, children);
  if (pending.some((g) => !inGoalScope(actor, g)))
    fail("部分个人目标超出管理范围，无法一起发布", 403);
  if (
    new Set(request.children.map((g) => g.id)).size !== request.children.length ||
    pending.length !== request.children.length ||
    pending.some(
      (g) => !request.children.some((ref) => ref.id === g.id && ref.version === g.version),
    )
  )
    fail("待发布个人目标已变化，请刷新后核对名单和目标值", 409);
  const plan = root.status === "draft" ? [root, ...pending] : pending;
  if (!plan.length) fail("暂无待发布目标，请刷新列表", 409);
  return plan;
}
