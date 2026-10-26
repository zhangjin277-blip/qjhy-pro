/* eslint-disable @typescript-eslint/no-non-null-assertion -- Known fixtures and recorded mock calls. */
import { describe, expect, it } from "vitest";
import {
  calculateBuyuMetric,
  buyuAccountProgress,
  reportNumber,
  type BuyuSourceRow,
} from "@/modules/goals/source-rules";
import { ALL_COLUMNS, ALL_GROUPS } from "@/modules/anchors";
import {
  BUYU_REPORT_COLUMNS,
  BUYU_PERCENT_COLUMNS,
  EXTERNAL_PLACEMENT_ACCOUNTS,
} from "@/modules/buyu";
import {
  DOUYIN_GOAL_GROUPS,
  goalMetrics,
  metricOption,
  SOURCE_PRODUCTS,
  buyuProductIds,
  BUYU_TOTAL_PRODUCT,
} from "@/modules/goals/catalog";
import { definitionSchema, validateProgress, goalProgress } from "@/modules/goals/rules";
import type { Goal, GoalBinding } from "@/modules/goals/types";
const binding: GoalBinding = {
  source: "buyu",
  product: "product_buyu",
  field: "消耗",
  selection: "all",
  account_ids: [],
  direction: "gte",
  qualification: null,
};
const row = (
  account_id: string,
  date: string,
  summary: Record<string, unknown>,
): BuyuSourceRow => ({
  account_id,
  account_name: account_id,
  date,
  cost: 123,
  additions: 10,
  payment: 5,
  raw: { _summary_months: { [date.slice(0, 7)]: summary } },
});
describe("standard goal metric catalogue", () => {
  it("shares every field and category with anchor custom columns, without inventing ROI", () => {
    expect(DOUYIN_GOAL_GROUPS).toEqual(ALL_GROUPS);
    expect(goalMetrics("douyin").map((m) => [m.key, m.label, m.group, m.subGroup])).toEqual(
      ALL_COLUMNS.filter((c) => !c.pinned).map((c) => [c.key, c.label, c.group, c.subGroup]),
    );
    expect(goalMetrics("douyin").some((m) => /ROI/i.test(m.label))).toBe(false);
    for (const c of ALL_COLUMNS.filter(
      (c) => !c.pinned && !["number", "duration", "percent"].includes(c.fmt),
    ))
      expect(metricOption("douyin", c.key)?.selectable).toBe(false);
  });
  it("keeps units for seconds, hours, currency, percentages and noninteger ACU", () => {
    expect(metricOption("douyin", "avg_watch_duration")?.unit).toBe("秒");
    expect(metricOption("douyin", "live_duration")?.unit).toBe("小时");
    expect(metricOption("douyin", "g_pay_amount")?.unit).toBe("元");
    expect(metricOption("douyin", "g_acu")?.kind).toBe("sum");
    expect(metricOption("douyin", "g_like_uavg")?.unit).toBe("%");
  });
  it("shares fishing fields and adds qualified accounts", () =>
    expect(goalMetrics("buyu").map((m) => m.key)).toEqual([
      ...BUYU_REPORT_COLUMNS,
      "qualified_accounts",
    ]));
  it("rejects source tampering and mismatch while accepting canonical fields", () => {
    const def = {
      period: "2026-10",
      project: "捕鱼",
      line: "整体",
      dept_id: null,
      owner_ids: [],
      owner_labels: [],
      metric: "消耗",
      unit: "元",
      kind: "sum",
      target: 20000000,
      definition: "月汇总",
      confirmed: false,
      parent_id: null,
      binding,
    };
    expect(definitionSchema.safeParse(def).success).toBe(true);
    for (const patch of [
      { unit: "万" },
      { project: "造化" },
      { metric: "随便填写" },
      { binding: { ...binding, field: "unsafe column" } },
      { binding: { ...binding, selection: "accounts", account_ids: [] } },
    ])
      expect(definitionSchema.safeParse({ ...def, ...patch }).success).toBe(false);
  });
  it("forbids manual overwrite of auto values and compares cost upper bounds", () => {
    const g = {
      binding: { ...binding, direction: "lte" },
      confirmed: true,
      target: 5,
      actual: 4,
      unit: "元",
      kind: "sum",
      status: "published",
      source_result: { status: "ready", note: "" },
    } as Goal;
    expect(() => validateProgress(g, 123, "2026-10-01", "test", "2026-10-16")).toThrow(
      "不能人工覆盖",
    );
    expect(goalProgress(g).label).toBe("符合上限");
  });
});
describe("fishing imported monthly totals", () => {
  it("parses original report numbers including zero and missing values", () => {
    expect(reportNumber({ " 消耗 ": "1,234元" }, "消耗")).toBe(1234);
    expect(reportNumber({ ROI: "0%" }, "ROI")).toBe(0);
    expect(reportNumber({ ROI: "--" }, "ROI")).toBeNull();
  });
  it("uses latest monthly snapshot once per account instead of adding daily repeats", () => {
    const rows = [
      row("a", "2026-10-01", { 消耗: 100 }),
      row("a", "2026-10-02", { 消耗: 300 }),
      row("b", "2026-10-02", { 消耗: 200 }),
    ];
    expect(calculateBuyuMetric(rows, binding, "2026-10").actual).toBe(500);
  });
  it("computes CPI from summed denominators", () => {
    expect(
      calculateBuyuMetric(
        [
          row("a", "2026-10-01", { 消耗: 100, 新增: 10 }),
          row("b", "2026-10-01", { 消耗: 900, 新增: 30 }),
        ],
        { ...binding, field: "总CPI" },
        "2026-10",
      ).actual,
    ).toBe(25);
  });
  it("weights net ROI by spend and does not average unrelated percentages", () => {
    expect(
      calculateBuyuMetric(
        [
          row("a", "2026-10-01", { 七日净ROI: 0.12, 消耗: 100 }),
          row("b", "2026-10-01", { 七日净ROI: 0.08, 消耗: 300 }),
        ],
        { ...binding, field: "七日净ROI" },
        "2026-10",
      ).actual,
    ).toBe(9);
    expect(
      calculateBuyuMetric(
        [row("a", "2026-10-01", { 七日净ROI: 0.12 })],
        { ...binding, field: "七日净ROI" },
        "2026-10",
      ).actual,
    ).toBe(12);
  });
  it("qualifies using explicit monthly realtime ROI threshold and excludes external accounts", () => {
    const external = [...EXTERNAL_PLACEMENT_ACCOUNTS][0]!;
    const rows = [
      row("a", "2026-10-01", { 实时净ROI: 0.12, 消耗: 100 }),
      row("a", "2026-10-02", { 实时净ROI: 0.13, 消耗: 200 }),
      row("b", "2026-10-02", { 实时净ROI: 0.11, 消耗: 1000 }),
      { ...row("x", "2026-10-02", { 实时净ROI: 0.99, 消耗: 9999 }), account_name: external },
    ];
    expect(
      calculateBuyuMetric(
        rows,
        { ...binding, field: "qualified_accounts", qualification: { roi: 12, min_cost: 100 } },
        "2026-10",
      ).actual,
    ).toBe(1);
  });
  it("never turns missing report summaries or unknown qualification into zero", () => {
    const g = { ...binding, field: "qualified_accounts", qualification: { roi: 12, min_cost: 0 } };
    const result = calculateBuyuMetric([row("a", "2026-10-01", { 消耗: 100 })], g, "2026-10");
    expect(result.actual).toBeNull();
    expect(result.unknown_accounts).toBe(1);
    expect(
      calculateBuyuMetric(
        [{ ...row("a", "2026-10-01", {}), raw: { 消耗: 100 } }],
        binding,
        "2026-10",
      ).actual,
    ).toBeNull();
    expect(
      calculateBuyuMetric([row("a", "2026-10-01", { 消耗: 0 })], binding, "2026-10").actual,
    ).toBe(0);
  });
  it("sums monthly amount totals but keeps quarterly qualification pending", () => {
    const rows = [row("a", "2026-10-01", { 消耗: 100 }), row("a", "2026-11-01", { 消耗: 200 })];
    expect(calculateBuyuMetric(rows, binding, "2026-Q4").actual).toBe(300);
    expect(
      calculateBuyuMetric(
        rows,
        { ...binding, field: "qualified_accounts", qualification: { roi: 12, min_cost: 0 } },
        "2026-Q4",
      ).actual,
    ).toBeNull();
  });
  it("does not discard ambiguous advertising subaccounts", () => {
    const a = row("a", "2026-10-01", { 消耗: 100 });
    expect(
      calculateBuyuMetric(
        [
          { ...a, subaccount_name: "one" },
          { ...a, subaccount_name: "two" },
        ],
        binding,
        "2026-10",
      ).actual,
    ).toBeNull();
  });
});

const totalBinding: GoalBinding = {
  ...binding,
  product: BUYU_TOTAL_PRODUCT,
  field: "qualified_accounts",
  qualification: null,
  qualification_by_product: {
    product_buyu: { roi: 12, min_cost: 100 },
    product_ue4: { roi: 13.5, min_cost: 200 },
    product_urp: { roi: 7.5, min_cost: 100 },
  },
};
const productRow = (
  product: string,
  id: string,
  values: Record<string, unknown>,
  date = "2026-10-05",
) => ({
  ...row(id, date, values),
  dataset_id: product,
});
describe("fishing total scope preserves product attribution", () => {
  it("adds a virtual scope without changing any Douyin or single fishing product identifiers", () => {
    expect(SOURCE_PRODUCTS.douyin).toEqual([
      { id: "ddz", name: "斗地主" },
      { id: "three", name: "三冰" },
      { id: "zhaohua", name: "造化" },
    ]);
    expect(buyuProductIds(BUYU_TOTAL_PRODUCT)).toEqual([
      "product_buyu",
      "product_ue4",
      "product_urp",
    ]);
    for (const id of ["product_buyu", "product_ue4", "product_urp"])
      expect(buyuProductIds(id)).toEqual([id]);
    expect(buyuProductIds("ddz")).toEqual([]);
  });
  it("keeps same-account snapshots from distinct products separate when summing spend", () => {
    const rows = [
      productRow("product_buyu", "a", { 消耗: 100 }),
      productRow("product_buyu", "a", { 消耗: 200 }, "2026-10-06"),
      productRow("product_ue4", "a", { 消耗: 300 }),
      productRow("product_urp", "b", { 消耗: 400 }),
    ];
    expect(
      calculateBuyuMetric(rows, { ...binding, product: BUYU_TOTAL_PRODUCT }, "2026-10").actual,
    ).toBe(900);
  });
  it("checks each product's threshold instead of applying the 3D threshold to all", () => {
    const rows = [
      productRow("product_buyu", "a", { 消耗: 100, 实时净ROI: 0.12 }),
      productRow("product_ue4", "b", { 消耗: 300, 实时净ROI: 0.13 }),
      productRow("product_urp", "c", { 消耗: 100, 实时净ROI: 0.08 }),
      productRow("product_ue4", "d", { 消耗: 100, 实时净ROI: 0.14 }),
    ];
    expect(calculateBuyuMetric(rows, totalBinding, "2026-10").actual).toBe(2);
    expect(
      calculateBuyuMetric(rows, { ...totalBinding, qualification_by_product: undefined }, "2026-10")
        .actual,
    ).toBeNull();
  });
  it("counts a live account once across products and keeps unknown accounts pending", () => {
    const rows = [
      productRow("product_buyu", "a", { 消耗: 100, 实时净ROI: 0.12 }),
      productRow("product_urp", "a", { 消耗: 100, 实时净ROI: 0.08 }),
    ];
    expect(calculateBuyuMetric(rows, totalBinding, "2026-10").actual).toBe(1);
    const unknown = calculateBuyuMetric(
      [...rows, productRow("product_ue4", "b", { 消耗: 500 })],
      totalBinding,
      "2026-10",
    );
    expect(unknown.actual).toBeNull();
    expect(unknown.unknown_accounts).toBe(1);
  });
  it("weights total ROI by spend while keeping product/account snapshots independent", () => {
    expect(
      calculateBuyuMetric(
        [
          productRow("product_buyu", "a", { 消耗: 100, 七日净ROI: 0.12 }),
          productRow("product_ue4", "a", { 消耗: 300, 七日净ROI: 0.08 }),
        ],
        { ...binding, product: BUYU_TOTAL_PRODUCT, field: "七日净ROI" },
        "2026-10",
      ).actual,
    ).toBe(9);
  });
  it("requires complete product-specific conditions and rejects them on existing sources", () => {
    const def = {
      period: "2026-10",
      project: "捕鱼",
      line: "整体",
      dept_id: null,
      owner_ids: ["manager"],
      owner_labels: [],
      metric: "达标账号数",
      unit: "个",
      kind: "count",
      target: 10,
      definition: "月汇总",
      confirmed: true,
      parent_id: null,
      binding: totalBinding,
    };
    expect(definitionSchema.safeParse(def).success).toBe(true);
    for (const patch of [
      { qualification_by_product: undefined },
      { qualification_by_product: { product_buyu: { roi: 12, min_cost: 0 } } },
      { product: "product_buyu" },
      { qualification: { roi: 12, min_cost: 0 } },
      { source: "douyin", product: "ddz" },
    ])
      expect(
        definitionSchema.safeParse({ ...def, binding: { ...totalBinding, ...patch } }).success,
      ).toBe(false);
  });
});

describe("per-account qualification gaps use the same monthly snapshots as goal totals", () => {
  it("shows product-specific ROI and spend gaps, met conditions and missing period accounts", () => {
    const rows = [
      productRow("product_buyu", "a", { 消耗: 20, 实时净ROI: 0.05 }, "2026-10-01"),
      productRow("product_buyu", "a", { 消耗: 50, 实时净ROI: 0.105 }),
      productRow("product_ue4", "b", { 消耗: 300, 实时净ROI: 0.14 }),
      productRow("product_urp", "c", { 消耗: 100 }),
    ];
    const progress = buyuAccountProgress(rows, totalBinding, "2026-10", [
      { id: "a", name: "账号A" },
      { id: "b", name: "账号B" },
      { id: "c", name: "账号C" },
      { id: "d", name: "账号D", products: ["product_ue4"] },
    ]);
    expect(progress).toHaveLength(4);
    expect(progress[0]).toMatchObject({
      id: "a",
      product_name: "3D",
      roi: 10.5,
      cost: 50,
      required_roi: 12,
      required_cost: 100,
      roi_gap: 1.5,
      cost_gap: 50,
      status: "unqualified",
      as_of: "2026-10-05",
    });
    expect(progress[1]).toMatchObject({
      id: "b",
      product_name: "UE4",
      required_roi: 13.5,
      required_cost: 200,
      roi_gap: 0,
      cost_gap: 0,
      status: "qualified",
    });
    expect(progress[2]).toMatchObject({
      id: "c",
      roi: null,
      roi_gap: null,
      cost_gap: 0,
      status: "pending",
    });
    expect(progress[3]).toMatchObject({
      id: "d",
      product_name: "UE4",
      roi: null,
      cost: null,
      required_roi: 13.5,
      status: "pending",
      as_of: null,
      note: "本期暂无投流日志",
    });
  });
  it("does not disclose rows absent from the authorized account roster", () => {
    const rows = [
      productRow("product_buyu", "a", { 消耗: 100, 实时净ROI: 0.15 }),
      productRow("product_ue4", "outside", { 消耗: 900, 实时净ROI: 0.99 }),
    ];
    expect(
      buyuAccountProgress(rows, totalBinding, "2026-10", [{ id: "a", name: "A" }]).map((a) => a.id),
    ).toEqual(["a"]);
  });
  it("keeps repeated-product accounts distinct in details while the total counts each account once", () => {
    const rows = [
      productRow("product_buyu", "a", { 消耗: 100, 实时净ROI: 0.15 }),
      productRow("product_ue4", "a", { 消耗: 300, 实时净ROI: 0.14 }),
    ];
    const progress = buyuAccountProgress(rows, totalBinding, "2026-10", [{ id: "a", name: "A" }]);
    expect(progress.map((a) => a.status)).toEqual(["qualified", "qualified"]);
    expect(calculateBuyuMetric(rows, totalBinding, "2026-10").actual).toBe(1);
  });
  it("uses original single-product thresholds, including zero minimum spend and zero ROI", () => {
    const b = { ...binding, field: "qualified_accounts", qualification: { roi: 12, min_cost: 0 } };
    const progress = buyuAccountProgress(
      [row("a", "2026-10-01", { 消耗: 0, 实时净ROI: 0.0 })],
      b,
      "2026-10",
      [{ id: "a", name: "A" }],
    );
    expect(progress[0]).toMatchObject({
      roi: 0,
      cost: 0,
      required_roi: 12,
      required_cost: 0,
      roi_gap: 12,
      cost_gap: 0,
      status: "unqualified",
    });
  });
  it("keeps ambiguous subaccounts, external accounts and missing thresholds explicit", () => {
    const external = [...EXTERNAL_PLACEMENT_ACCOUNTS][0]!;
    const a = productRow("product_buyu", "a", { 消耗: 100, 实时净ROI: 0.2 });
    const rows = [
      { ...a, subaccount_name: "one" },
      { ...a, subaccount_name: "two" },
      productRow("product_ue4", "x", { 消耗: 500, 实时净ROI: 0.99 }),
    ];
    const progress = buyuAccountProgress(rows, totalBinding, "2026-10", [
      { id: "a", name: "A" },
      { id: "x", name: external },
    ]);
    expect(progress[0]).toMatchObject({ roi: null, cost: null, status: "pending" });
    expect(progress[0]?.note).toContain("多个广告子账号");
    expect(progress[1]?.status).toBe("excluded");
    const missing = buyuAccountProgress(
      [a],
      { ...totalBinding, qualification_by_product: undefined },
      "2026-10",
      [{ id: "a", name: "A" }],
    );
    expect(missing[0]).toMatchObject({
      required_roi: null,
      required_cost: null,
      status: "pending",
    });
  });
  it("does not invent product attribution for missing total-scope accounts or show progress for other metrics", () => {
    expect(
      buyuAccountProgress([], totalBinding, "2026-10", [{ id: "a", name: "A" }])[0],
    ).toMatchObject({ product: "", product_name: "产品待确认", status: "pending" });
    expect(buyuAccountProgress([], binding, "2026-10", [{ id: "a", name: "A" }])).toEqual([]);
    expect(buyuAccountProgress([], totalBinding, "2026-Q4", [{ id: "a", name: "A" }])).toEqual([]);
  });
});

it("normalizes the actual imported Excel ROI fraction before comparing percentage targets", () => {
  // Read-only local evidence: 2026-10, 捕鱼大作战, product_buyu, latest 2026-10-15.
  const imported = row("reported-account", "2026-10-15", {
    实时净ROI: 0.0776,
    七日净ROI: 0.0881,
    消耗: 2161578,
  });
  const b: GoalBinding = {
    ...binding,
    field: "qualified_accounts",
    qualification: { roi: 12, min_cost: 100000 },
  };
  const progress = buyuAccountProgress([imported], b, "2026-10", [
    { id: "reported-account", name: "捕鱼大作战" },
  ]);
  expect(progress[0]?.roi).toBeCloseTo(7.76);
  expect(progress[0]?.roi_gap).toBeCloseTo(4.24);
  expect(progress[0]?.cost).toBe(2161578);
  expect(progress[0]?.cost_gap).toBe(0);
  expect(progress[0]?.status).toBe("unqualified");
  expect(
    calculateBuyuMetric([imported], { ...binding, field: "七日净ROI" }, "2026-10").actual,
  ).toBeCloseTo(8.81);
  const qualified = row("meets", "2026-10-15", { 实时净ROI: 0.13, 消耗: 100000 });
  expect(calculateBuyuMetric([qualified], b, "2026-10").actual).toBe(1);
});

it("scales all known report percentage columns without guessing by magnitude or changing money/counts", () => {
  for (const field of BUYU_PERCENT_COLUMNS) {
    expect(reportNumber({ [field]: 0.0776 }, field)).toBeCloseTo(7.76);
    expect(reportNumber({ [field]: "0.0776" }, field)).toBeCloseTo(7.76);
    expect(reportNumber({ [field]: "7.76%" }, field)).toBeCloseTo(7.76);
    expect(reportNumber({ [field]: "7.76％" }, field)).toBeCloseTo(7.76);
    expect(reportNumber({ [field]: 1.25 }, field)).toBe(125);
    expect(reportNumber({ [field]: 0 }, field)).toBe(0);
    expect(reportNumber({ [field]: null }, field)).toBeNull();
    expect(reportNumber({ [field]: "--" }, field)).toBeNull();
  }
  for (const field of ["消耗", "总CPI", "首日付费成本", "新增", "自然量新增"])
    expect(reportNumber({ [field]: 1.25 }, field)).toBe(1.25);
});
