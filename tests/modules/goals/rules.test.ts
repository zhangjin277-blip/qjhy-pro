import { describe, expect, it } from "vitest";
import {
  definitionSchema,
  goalProgress,
  inGoalScope,
  mutationSchema,
  periodBounds,
  requireGoalPoint,
  validateAllocation,
  validateProgress,
  validateMetricWeights,
  canManageTeamGoals,
  requireGoalOwnerAssignment,
  requireGoalDefinitionAccess,
} from "@/modules/goals/rules";
import { INITIAL_GOALS } from "@/modules/goals/initial-goals";
import { ROLE_DEFAULTS_SEED } from "@/modules/permissions/role-defaults";
import type { Goal, GoalAccess } from "@/modules/goals/types";
const goal: Goal = {
  id: "00000000-0000-4000-8000-000000000001",
  period: "2026-10",
  project: "三冰",
  line: "创作者",
  dept_id: "d1",
  owner_ids: ["u1"],
  owner_labels: [],
  metric: "UV",
  unit: "人",
  kind: "sum",
  target: 1000000,
  actual: null,
  as_of: null,
  evidence: "",
  definition: "按周期去重",
  confirmed: true,
  parent_id: null,
  status: "draft",
  version: 1,
  created_by: "u1",
  updated_at: "2026-10-15T00:00:00Z",
};
const access: GoalAccess = {
  userId: "u1",
  name: "员工",
  scope: "self",
  points: ["view", "fill"],
  deptIds: [],
  delegatedIds: null,
};
describe("goal permissions", () => {
  it("reserves team management for all-scope managers and leaders with managed departments", () => {
    expect(canManageTeamGoals(access)).toBe(false);
    expect(canManageTeamGoals({ ...access, scope: "team" })).toBe(false);
    expect(canManageTeamGoals({ ...access, scope: "team", deptIds: ["d1"] })).toBe(true);
    expect(canManageTeamGoals({ ...access, scope: "all" })).toBe(true);
    expect(canManageTeamGoals({ ...access, scope: "all", delegatedIds: ["u2"] })).toBe(false);
  });
  it("does not turn delegated viewing or an own/other mixed owner list into assignment permission", () => {
    expect(() => requireGoalOwnerAssignment(access, ["u1"])).not.toThrow();
    for (const owners of [[], ["u2"], ["u1", "u2"]])
      expect(() => requireGoalOwnerAssignment(access, owners)).toThrow("本人");
    expect(() =>
      requireGoalOwnerAssignment({ ...access, scope: "all", delegatedIds: ["u2"] }, ["u2"]),
    ).toThrow("本人");
    expect(() =>
      requireGoalOwnerAssignment({ ...access, scope: "team", deptIds: ["d1"] }, ["u2"]),
    ).not.toThrow();
  });
  it("requires an ordinary operator to link a personal operator definition to a team", () => {
    expect(() => requireGoalDefinitionAccess(access, goal)).toThrow("团队目标");
    const personal = {
      ...goal,
      team_parent_id: "team",
      binding: {
        source: "douyin" as const,
        product: "ddz",
        field: "g_pay_amount",
        selection: "operators" as const,
        account_ids: [],
        direction: "gte" as const,
        qualification: null,
      },
    };
    expect(() => requireGoalDefinitionAccess(access, personal)).not.toThrow();
    expect(() =>
      requireGoalDefinitionAccess(access, { ...personal, team_parent_id: null }),
    ).toThrow();
    expect(() => requireGoalDefinitionAccess(access, { ...personal, owner_ids: ["u2"] })).toThrow();
  });
  it("defaults all ordinary positions to opt-in and requires view plus scope", () => {
    expect(
      ROLE_DEFAULTS_SEED.filter((r) => r.module === "goals").every(
        (r) => r.scope === "none" && !r.points.length,
      ),
    ).toBe(true);
    expect(() => requireGoalPoint({ ...access, points: ["fill"] }, "fill")).toThrow("权限");
    expect(() => requireGoalPoint({ ...access, scope: "none" })).toThrow();
    expect(() => requireGoalPoint(access, "publish")).toThrow("发布");
  });
  it("allows self and directly managed teams but rejects unrelated and empty delegated scopes", () => {
    expect(inGoalScope(access, goal)).toBe(true);
    expect(inGoalScope(access, { ...goal, owner_ids: ["u2"] })).toBe(false);
    expect(
      inGoalScope({ ...access, scope: "team", deptIds: ["d1"] }, { ...goal, owner_ids: ["u2"] }),
    ).toBe(true);
    expect(
      inGoalScope({ ...access, scope: "team", deptIds: ["d2"] }, { ...goal, owner_ids: ["u2"] }),
    ).toBe(false);
    expect(inGoalScope({ ...access, scope: "all", delegatedIds: [] }, goal)).toBe(false);
    expect(inGoalScope({ ...access, scope: "all", delegatedIds: ["u2"] }, goal)).toBe(false);
  });
});
describe("definitions and actual reporting", () => {
  it("imports only screenshot definitions as pending, with 14 known monthly scalar targets", () => {
    expect(INITIAL_GOALS).toHaveLength(17);
    expect(INITIAL_GOALS.filter((g) => g.period === "2026-10" && g.target !== null)).toHaveLength(
      14,
    );
    expect(INITIAL_GOALS.every((g) => !g.confirmed && !("actual" in g))).toBe(true);
    expect(INITIAL_GOALS.find((g) => g.key === "hr-anchor")?.target).toBe(8);
  });
  it("rejects invalid periods, nonfinite values, fractional counts and unresolved confirmation", () => {
    expect(() => periodBounds("2026-13")).toThrow();
    expect(periodBounds("2026-Q4")).toEqual({ start: "2026-10-01", end: "2026-12-31" });
    const {
      id: _id,
      actual: _a,
      as_of: _d,
      evidence: _e,
      status: _s,
      version: _v,
      created_by: _c,
      updated_at: _u,
      ...definition
    } = goal;
    expect(definitionSchema.safeParse(definition).success).toBe(true);
    for (const patch of [
      { target: Infinity },
      { kind: "count", target: 1.5 },
      { kind: "ratio", unit: "元" },
      { owner_ids: [] },
      { owner_labels: ["待匹配"] },
    ])
      expect(definitionSchema.safeParse({ ...definition, ...patch }).success).toBe(false);
    expect(
      mutationSchema.safeParse({
        action: "progress",
        id: goal.id,
        version: 1,
        actual: NaN,
        as_of: null,
        evidence: "",
        reason: "测试",
      }).success,
    ).toBe(false);
  });
  it("distinguishes unknown from a measured zero and ratios from completion percentages", () => {
    expect(goalProgress(goal)).toMatchObject({ label: "待填报", percent: null });
    expect(goalProgress({ ...goal, actual: 0 })).toMatchObject({ percent: 0 });
    expect(
      goalProgress({ ...goal, kind: "ratio", unit: "%", actual: 11, target: 12 }),
    ).toMatchObject({ label: "差 1 个百分点", percent: null, attention: true });
    expect(goalProgress({ ...goal, confirmed: false, actual: 0 })).toMatchObject({
      label: "口径待配置",
      percent: null,
    });
  });
  it("requires valid period date, confirmed definitions, evidence, and integer counts", () => {
    expect(() => validateProgress(goal, 0, "2026-10-15", "核对报表", "2026-10-15")).not.toThrow();
    for (const date of ["2026-09-30", "2026-10-16", "2026-10-32", "2026-99-01", null])
      expect(() => validateProgress(goal, 1, date, "依据", "2026-10-15")).toThrow();
    expect(() => validateProgress(goal, 1, "2026-10-15", "", "2026-10-15")).toThrow("依据");
    expect(() =>
      validateProgress({ ...goal, confirmed: false }, 1, "2026-10-15", "依据", "2026-10-15"),
    ).toThrow("口径");
    expect(() =>
      validateProgress({ ...goal, kind: "count" }, 1.2, "2026-10-15", "依据", "2026-10-15"),
    ).toThrow("整数");
    expect(() =>
      validateProgress({ ...goal, status: "closed" }, null, null, "", "2026-10-15"),
    ).toThrow("归档");
  });
});
describe("quarter allocations", () => {
  const parent = { ...goal, period: "2026-Q4", target: 3000000 };
  it("allows partially allocated months and keeps quarter actuals independent", () => {
    expect(() => validateAllocation(goal, parent, [])).not.toThrow();
    expect(parent.actual).toBe(null);
    expect(() => validateAllocation({ ...goal, period: "2026-11" }, parent, [goal])).not.toThrow();
  });
  it("rejects overallocations, duplicate months, mismatched scopes and summed ROI thresholds", () => {
    expect(() => validateAllocation({ ...goal, target: 3000001 }, parent, [])).toThrow("超过");
    expect(() => validateAllocation(goal, parent, [goal])).toThrow("已有");
    expect(() => validateAllocation({ ...goal, owner_ids: ["u2"] }, parent, [])).toThrow("负责人");
    expect(() => validateAllocation({ ...goal, definition: "另一口径" }, parent, [])).toThrow(
      "口径",
    );
    expect(() => validateAllocation({ ...goal, period: "2026-09" }, parent, [])).toThrow("季度内");
    expect(() =>
      validateAllocation({ ...goal, kind: "ratio" }, { ...parent, kind: "ratio" }, []),
    ).toThrow("不能按月相加");
  });
});

describe("metric weight validation", () => {
  it("accepts automatic shares and complete custom percentages", () => {
    expect(() => validateMetricWeights([goal, { ...goal, weight: null }])).not.toThrow();
    expect(() =>
      validateMetricWeights([
        { ...goal, weight: 75 },
        { ...goal, weight: 25 },
      ]),
    ).not.toThrow();
  });
  it("rejects incomplete, out of range, nonfinite and incorrect totals", () => {
    for (const weights of [
      [50, null],
      [60, 60],
      [101, -1],
      [NaN, 100],
      [Infinity, 0],
    ])
      expect(() => validateMetricWeights(weights.map((weight) => ({ ...goal, weight })))).toThrow(
        "权重",
      );
    for (const weight of [-1, 101, NaN, Infinity])
      expect(definitionSchema.safeParse({ ...goal, weight }).success).toBe(false);
  });
});
