import { describe, expect, it } from "vitest";
import {
  newMetricDraft,
  draftFromDefinition,
  mergeMetric,
  metricDefinitions,
} from "@/app/(dashboard)/goals/metric-drafts";
import type { GoalBinding, GoalDefinition } from "@/modules/goals";
const binding: GoalBinding = {
  source: "douyin",
  product: "ddz",
  field: "controller_total_amount",
  selection: "accounts",
  account_ids: ["old"],
  direction: "gte",
  qualification: null,
};
const base = {
  period: "2026-06",
  project: "斗地主",
  line: "整体",
  dept_id: "offline",
  owner_ids: ["op"],
  owner_labels: [],
  confirmed: true,
  ...newMetricDraft(binding, binding.field),
  binding,
} as GoalDefinition;
describe("multiple goal metrics share scope and keep independent metric settings", () => {
  it("uses current scope instead of stale account lists while retaining each target and field", () => {
    const draft = newMetricDraft(binding, "g_watch_ucnt");
    expect(draft).not.toBeNull();
    if (!draft) return;
    const result = metricDefinitions(
      { ...base, target: 500000, binding: { ...binding, account_ids: ["new"] } },
      [{ ...draft, target: 300000 }],
    );
    expect(result.map((g) => g.target)).toEqual([500000, 300000]);
    expect(result[1]?.binding?.account_ids).toEqual(["new"]);
    expect(result[1]?.binding?.field).toBe("g_watch_ucnt");
    expect(result[1]?.unit).toBe(draft.unit);
    expect(result[1]?.definition).toBe(draft.definition);
  });
  it("creates separate fishing qualification settings and preserves them when switching the active metric", () => {
    const draft = newMetricDraft(
      { ...binding, source: "buyu", product: "product_ue4" },
      "qualified_accounts",
    );
    expect(draft?.binding.qualification).toEqual({ roi: 13.5, min_cost: 0 });
    if (!draft) return;
    const result = mergeMetric(
      { ...base, binding: { ...draft.binding, account_ids: ["fish"] } },
      { ...draft, target: 8 },
    );
    expect(result.target).toBe(8);
    expect(result.binding?.account_ids).toEqual(["fish"]);
    expect(result.binding?.qualification).toEqual({ roi: 13.5, min_cost: 0 });
  });
});

it("preserves independent weights through editing and switching metrics", () => {
  const draft = newMetricDraft(binding, "g_watch_ucnt");
  if (!draft) throw new Error("fixture");
  expect(draft.weight).toBeNull();
  const primary = { ...base, weight: 75 };
  expect(draftFromDefinition(primary)?.weight).toBe(75);
  expect(metricDefinitions(primary, [{ ...draft, weight: 25 }]).map((d) => d.weight)).toEqual([
    75, 25,
  ]);
});

it("keeps total-product qualification on its own metric when adding or switching spend", () => {
  const source = { ...binding, source: "buyu" as const, product: "product_buyu_all" };
  const qualified = newMetricDraft(source, "qualified_accounts");
  if (!qualified) throw new Error("fixture");
  expect(qualified.binding.qualification).toBeNull();
  expect(qualified.binding.qualification_by_product?.product_urp?.roi).toBe(7.5);
  const spend = newMetricDraft(qualified.binding, "消耗");
  if (!spend) throw new Error("fixture");
  expect(spend.binding.qualification_by_product).toBeUndefined();
  const combined = metricDefinitions({ ...base, ...qualified }, [spend]);
  expect(combined[0]?.binding?.qualification_by_product).toEqual(
    qualified.binding.qualification_by_product,
  );
  expect(combined[1]?.binding?.qualification_by_product).toBeUndefined();
  expect(mergeMetric({ ...base, ...spend }, qualified).binding?.qualification_by_product).toEqual(
    qualified.binding.qualification_by_product,
  );
});
