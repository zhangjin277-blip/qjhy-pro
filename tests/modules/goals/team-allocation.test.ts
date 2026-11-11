import { describe, expect, it } from "vitest";
import type { Goal, GoalBinding } from "@/modules/goals/types";
import {
  supportsTeamSplit,
  personalDefinition,
  validateTeamAllocation,
  isAccountScopeExpansion,
} from "@/modules/goals/team-allocation";
import { definitionSchema, validateAllocation } from "@/modules/goals/rules";
import { isAdditiveMetric } from "@/modules/goals/catalog";
import { calculateBuyuMetric, type BuyuSourceRow } from "@/modules/goals/source-rules";

const binding: GoalBinding = {
  source: "buyu",
  product: "product_buyu",
  field: "qualified_accounts",
  selection: "all",
  account_ids: [],
  direction: "gte",
  qualification: { roi: 12, min_cost: 100 },
};
const parent: Goal = {
  id: "00000000-0000-4000-8000-000000000001",
  period: "2026-10",
  project: "捕鱼",
  line: "整体",
  dept_id: "fishing",
  owner_ids: ["manager"],
  owner_labels: [],
  metric: "达标账号数",
  unit: "个",
  kind: "count",
  target: 10,
  weight: 30,
  definition: "月汇总实时净ROI及最低消耗达标",
  confirmed: true,
  binding,
  parent_id: null,
  team_parent_id: null,
  actual: null,
  as_of: null,
  evidence: "",
  status: "published",
  version: 1,
  created_by: "manager",
  updated_at: "2026-10-17",
};
const personal = (ownerId: string, target: number) =>
  personalDefinition(parent, ownerId, target, parent.id);

describe("monthly qualified-account team allocation", () => {
  it("allows adding team accounts while preserving every existing account", () => {
    const previous = { ...binding, selection: "accounts" as const, account_ids: ["a", "b"] };
    expect(
      isAccountScopeExpansion(previous, {
        ...previous,
        account_ids: ["c", "b", "a"],
      }),
    ).toBe(true);
    expect(isAccountScopeExpansion(previous, { ...previous, account_ids: ["b", "a"] })).toBe(true);
    expect(
      isAccountScopeExpansion(previous, {
        ...previous,
        product: "product_ue4",
        account_ids: ["a", "b", "c"],
      }),
    ).toBe(false);
    expect(
      isAccountScopeExpansion(previous, {
        ...previous,
        account_ids: ["a"],
      }),
    ).toBe(false);
    expect(
      isAccountScopeExpansion(previous, {
        ...previous,
        selection: "all",
        account_ids: [],
      }),
    ).toBe(false);
  });
  it("allows both metrics in the fishing qualified-account and spend group", () => {
    const spend: Goal = {
      ...parent,
      metric: "消耗",
      kind: "sum",
      unit: "元",
      target: 500000,
      binding: { ...binding, field: "消耗", qualification: null },
    };
    expect([parent, spend].every(supportsTeamSplit)).toBe(true);
  });
  it("inherits the team's qualification, source, period and weight for each operator", () => {
    const child = personal("operator1", 4);
    expect(child).toMatchObject({
      period: parent.period,
      team_parent_id: parent.id,
      weight: 30,
      binding: { ...binding, selection: "operators", account_snapshot_at: null },
    });
    expect(definitionSchema.safeParse(child).success).toBe(true);
    expect(() => validateTeamAllocation(child, parent, [personal("operator2", 6)])).not.toThrow();
  });
  it("does not reinterpret account counts as additive across months", () => {
    expect(isAdditiveMetric("buyu", "qualified_accounts")).toBe(false);
    const quarter = { ...parent, period: "2026-Q4" };
    expect(supportsTeamSplit(quarter)).toBe(false);
    expect(() => validateAllocation({ ...parent, parent_id: quarter.id }, quarter, [])).toThrow();
  });
  it("keeps ROI, upper bounds and personal goals out of direct splitting", () => {
    expect(
      supportsTeamSplit({
        ...parent,
        metric: "七日净ROI",
        kind: "ratio",
        unit: "%",
        binding: { ...binding, field: "七日净ROI", qualification: null },
      }),
    ).toBe(false);
    expect(supportsTeamSplit({ ...parent, binding: { ...binding, direction: "lte" } })).toBe(false);
    expect(supportsTeamSplit({ ...parent, ...personal("operator1", 4) })).toBe(false);
  });
  it("requires integer counts and enforces the team's total allocation", () => {
    expect(definitionSchema.safeParse(personal("operator1", 1.5)).success).toBe(false);
    expect(() =>
      validateTeamAllocation(personal("operator1", 5), parent, [personal("operator2", 6)]),
    ).toThrow("个人分配总额超过团队目标");
  });
  it.each([
    { roi: 15, min_cost: 100 },
    { roi: 12, min_cost: 0 },
  ])("rejects changing inherited account conditions", (qualification) => {
    const child = personal("operator1", 4);
    expect(() =>
      validateTeamAllocation(
        { ...child, binding: { ...binding, selection: "operators", qualification } },
        parent,
        [],
      ),
    ).toThrow("沿用团队的统计口径和达成条件");
  });
  it("counts each operator's qualifying accounts independently and reconciles disjoint sets", () => {
    const row = (id: string, roi: number): BuyuSourceRow => ({
      account_id: id,
      account_name: id,
      date: "2026-10-17",
      cost: 100,
      additions: 0,
      payment: 0,
      raw: { _summary_months: { "2026-10": { 实时净ROI: roi / 100, 消耗: 100 } } },
    });
    const first = [row("a", 15), row("b", 8)];
    const second = [row("c", 13), row("d", 14)];
    const actual = (rows: BuyuSourceRow[]) =>
      calculateBuyuMetric(rows, binding, parent.period).actual;
    expect([
      actual(first),
      actual(second),
      actual(first.concat(second, first.slice(0, 1))),
    ]).toEqual([1, 2, 3]);
  });
});

it("splits the fishing total and inherits all per-product conditions without changing single-product teams", () => {
  const total: Goal = {
    ...parent,
    binding: {
      ...binding,
      product: "product_buyu_all",
      qualification: null,
      qualification_by_product: {
        product_buyu: { roi: 12, min_cost: 100 },
        product_ue4: { roi: 13.5, min_cost: 200 },
        product_urp: { roi: 7.5, min_cost: 100 },
      },
    },
  };
  expect(supportsTeamSplit(total)).toBe(true);
  const child = personalDefinition(total, "operator", 5, total.id);
  expect(definitionSchema.safeParse(child).success).toBe(true);
  expect(child.binding?.qualification_by_product).toEqual(total.binding?.qualification_by_product);
  expect(() => validateTeamAllocation(child, total, [])).not.toThrow();
  if (!child.binding) throw new Error("fixture");
  const changed = {
    ...child,
    binding: {
      ...child.binding,
      qualification_by_product: {
        ...child.binding?.qualification_by_product,
        product_ue4: { roi: 0, min_cost: 0 },
      },
    },
  };
  expect(() => validateTeamAllocation(changed, total, [])).toThrow("沿用团队");
  expect(() => validateTeamAllocation(child, parent, [])).toThrow("相同周期、项目、部门及指标");
});

it("compares inherited total conditions by value after database JSONB and schema key reordering", () => {
  const stored: Goal = {
    ...parent,
    binding: {
      ...binding,
      product: "product_buyu_all",
      qualification: null,
      // JSONB returns shorter product keys first; Zod rebuilds schema declaration order.
      qualification_by_product: {
        product_ue4: { roi: 13.5, min_cost: 200 },
        product_urp: { roi: 7.5, min_cost: 100 },
        product_buyu: { roi: 12, min_cost: 100 },
      },
    },
  };
  const parsed = definitionSchema.parse(personalDefinition(stored, "operator", 4, stored.id));
  expect(Object.keys(parsed.binding?.qualification_by_product ?? {})).not.toEqual(
    Object.keys(stored.binding?.qualification_by_product ?? {}),
  );
  expect(() => validateTeamAllocation(parsed, stored, [])).not.toThrow();
  if (!parsed.binding?.qualification_by_product) throw new Error("fixture");
  for (const product of ["product_buyu", "product_ue4", "product_urp"] as const) {
    const original = parsed.binding.qualification_by_product[product];
    if (!original) throw new Error("fixture");
    for (const condition of [
      { ...original, roi: original.roi + 1 },
      { ...original, min_cost: original.min_cost + 1 },
    ]) {
      const changed = {
        ...parsed,
        binding: {
          ...parsed.binding,
          qualification_by_product: {
            ...parsed.binding.qualification_by_product,
            [product]: condition,
          },
        },
      };
      expect(() => validateTeamAllocation(changed, stored, [])).toThrow("沿用团队");
    }
  }
});

it("accepts identical single-product conditions regardless of JSON property order", () => {
  const stored: Goal = {
    ...parent,
    binding: { ...binding, qualification: { min_cost: 100, roi: 12 } },
  };
  const parsed = definitionSchema.parse(personalDefinition(stored, "operator", 4, stored.id));
  expect(() => validateTeamAllocation(parsed, stored, [])).not.toThrow();
});
