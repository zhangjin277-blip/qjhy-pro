import { describe, expect, it } from "vitest";
import type { Goal, GoalAccess, GoalBinding } from "@/modules/goals/types";
import { pendingTeamMetricGoals, teamPublicationPlan } from "@/modules/goals/team-publication";

const actor: GoalAccess = {
  userId: "manager",
  name: "负责人",
  scope: "team",
  deptIds: ["offline"],
  points: ["view", "publish"],
  delegatedIds: null,
};
const binding: GoalBinding = {
  source: "douyin",
  product: "ddz",
  field: "controller_total_amount",
  selection: "all",
  account_ids: [],
  direction: "gte",
  qualification: null,
};
const root: Goal = {
  id: "flow",
  period: "2026-10",
  project: "斗地主",
  line: "整体",
  dept_id: "offline",
  owner_ids: ["manager"],
  owner_labels: [],
  metric: "小手柄流水",
  unit: "元",
  kind: "sum",
  target: 100000,
  weight: 50,
  actual: null,
  as_of: null,
  evidence: "",
  definition: "直播流水",
  confirmed: true,
  parent_id: null,
  team_parent_id: null,
  status: "draft",
  version: 1,
  created_by: "manager",
  updated_at: "2026-10-17",
  binding,
};
const sound: Goal = {
  ...root,
  id: "sound",
  metric: "总音浪",
  unit: "音浪",
  binding: { ...binding, field: "total_diamond" },
};
const child: Goal = {
  ...root,
  id: "child",
  team_parent_id: sound.id,
  owner_ids: ["operator"],
  target: 50000,
  binding: { ...binding, selection: "operators" },
};
const ref = (g: Goal) => ({ id: g.id, version: g.version });
function plan(
  children: Goal[] = [child],
  selected = root,
  refs = children.map(ref),
  access = actor,
) {
  return teamPublicationPlan(access, selected, [selected, sound], children, {
    goal: ref(selected),
    children: refs,
  });
}

describe("confirmed team metric publication", () => {
  it("publishes the draft team first and resolves children through any representative metric", () => {
    expect(plan()).toEqual([root, child]);
  });
  it("only publishes pending personal goals when the team is already published", () => {
    expect(plan([child], { ...root, status: "published" })).toEqual([child]);
  });
  it("excludes other metrics, teams, published, archived and deleted goals", () => {
    const others: Goal[] = [
      {
        ...child,
        id: "other-metric",
        metric: sound.metric,
        unit: sound.unit,
        binding: sound.binding,
      },
      { ...child, id: "other-team", team_parent_id: "unrelated-team" },
      { ...child, id: "published", status: "published" },
      { ...child, id: "closed", status: "closed" },
      { ...child, id: "deleted", deleted_at: "2026-10-17" },
    ];
    expect(pendingTeamMetricGoals(root, [root, sound], [child, ...others])).toEqual([child]);
    expect(plan([child, ...others], root, [ref(child)])).toEqual([root, child]);
  });
  it("allows publishing just a draft team with no pending personal goals", () => {
    expect(plan([])).toEqual([root]);
  });
  it("rejects an already published team with no pending goals", () => {
    expect(() => plan([], { ...root, status: "published" })).toThrow("暂无待发布");
  });
  it.each([
    ["new unseen draft", []],
    ["stale child target or version", [{ id: child.id, version: 0 }]],
    ["duplicate child", [ref(child), ref(child)]],
    ["removed or unrelated child", [ref(child), { id: "removed", version: 1 }]],
  ])("rejects %s instead of silently changing the confirmed set", (_label, refs) => {
    expect(() => plan([child], root, refs as { id: string; version: number }[])).toThrow(
      "待发布个人目标已变化",
    );
  });
  it("rejects stale team versions", () => {
    expect(() =>
      teamPublicationPlan(actor, root, [root], [child], {
        goal: { ...ref(root), version: 0 },
        children: [ref(child)],
      }),
    ).toThrow("团队指标已变化");
  });
  it.each([
    { ...actor, scope: "self" as const },
    { ...actor, scope: "team" as const, deptIds: [] },
    { ...actor, scope: "all" as const, delegatedIds: ["operator"] },
    { ...actor, points: ["view", "fill"] },
    { ...actor, deptIds: ["other"], userId: "unrelated" },
  ])("requires independent publishing permission and team management within scope", (access) => {
    expect(() => plan([child], root, [ref(child)], access)).toThrow();
  });
  it("refuses the entire batch if a child is outside the manager scope", () => {
    expect(() => plan([{ ...child, dept_id: "other" }])).toThrow("部分个人目标超出管理范围");
  });
  it.each([
    { ...root, status: "closed" as const },
    { ...root, deleted_at: "2026-10-17" },
    { ...root, team_parent_id: "another" },
    { ...root, binding: { ...binding, selection: "operators" as const } },
  ])("rejects archived, deleted or personal roots", (selected) => {
    expect(() => plan([], selected)).toThrow("请选择未归档的团队指标");
  });
});
