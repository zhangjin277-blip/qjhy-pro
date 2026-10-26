import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BuyuProductDetails } from "@/app/(dashboard)/goals/buyu-product-details";
import { buyuAccountProgress, type BuyuSourceRow } from "@/modules/goals/source-rules";
import type { Goal, GoalBinding } from "@/modules/goals/types";
const binding: GoalBinding = {
  source: "buyu",
  product: "product_buyu",
  field: "qualified_accounts",
  selection: "operators",
  account_ids: [],
  direction: "gte",
  qualification: { roi: 12, min_cost: 100 },
};
const row: BuyuSourceRow = {
  account_id: "a",
  account_name: "测试账号",
  date: "2026-10-15",
  cost: 50,
  additions: 0,
  payment: 0,
  raw: { _summary_months: { "2026-10": { 实时净ROI: 0.105, 消耗: 50 } } },
};
const goal = (b = binding) =>
  ({
    binding: b,
    unit: "个",
    source_result: {
      status: "ready",
      note: "",
      account_progress: buyuAccountProgress([row], b, "2026-10", [
        { id: "a", name: "测试账号" },
        { id: "b", name: "无记录账号" },
      ]),
    },
  }) as Goal;

describe("qualified-account goal detail", () => {
  it("renders actual monthly ROI and spend against thresholds, with explicit gaps and unknown accounts", () => {
    const html = renderToStaticMarkup(createElement(BuyuProductDetails, { goal: goal() }));
    for (const label of [
      "账号达标进度",
      "测试账号",
      "10.5%",
      "目标 ≥ 12%",
      "还差 1.5 个百分点",
      "目标 ≥ 100元",
      "还差 50元",
      "无记录账号",
      "待确认",
      "本期暂无投流日志",
    ])
      expect(html).toContain(label);
    expect(html).toContain('aria-valuenow="87.5"');
    expect(html).toContain('aria-valuenow="50"');
    expect(html).not.toContain("按产品查看完成明细");
  });
  it("labels zero minimum spend without inventing a spending target", () => {
    const html = renderToStaticMarkup(
      createElement(BuyuProductDetails, {
        goal: goal({ ...binding, qualification: { roi: 12, min_cost: 0 } }),
      }),
    );
    expect(html).toContain("无最低消耗要求");
    expect(html).not.toContain("还差 0元");
  });
  it("does not render unauthorized or absent progress data", () => {
    const g = { binding, source_result: { status: "forbidden", note: "无来源权限" } } as Goal;
    expect(renderToStaticMarkup(createElement(BuyuProductDetails, { goal: g }))).toBe("");
  });
});
