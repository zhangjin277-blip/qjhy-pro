import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GoalPerformanceDetails } from "@/app/(dashboard)/goals/goal-performance-details";
import type { Goal, GoalBinding } from "@/modules/goals/types";

const binding: GoalBinding = {
  source: "douyin",
  product: "ddz",
  field: "controller_total_amount",
  selection: "accounts",
  account_ids: ["a", "b"],
  direction: "gte",
  qualification: null,
};
const goal: Goal = {
  id: "test",
  period: "2026-10",
  project: "斗地主",
  line: "整体",
  dept_id: "offline",
  owner_ids: ["u"],
  owner_labels: [],
  metric: "小手柄流水",
  unit: "元",
  kind: "sum",
  target: 500000,
  actual: 159700,
  as_of: "2026-10-14",
  definition: "按账号统计",
  confirmed: true,
  parent_id: null,
  status: "published",
  version: 1,
  created_by: "u",
  updated_at: "",
  evidence: "",
  binding,
  source_result: {
    status: "ready",
    note: "",
    account_values_additive: true,
    account_values: [
      { id: "a", name: "甲", actual: 159700, as_of: "2026-10-14", status: "ready", note: "" },
      {
        id: "b",
        name: "停播账号",
        actual: 0,
        as_of: null,
        status: "no_record",
        note: "本期无记录，按0计入",
      },
    ],
  },
};
const render = (g: Goal) =>
  renderToStaticMarkup(createElement(GoalPerformanceDetails, { goal: g }));

describe("visual metric details", () => {
  it("shows goal progress followed by account contributions, without inventing account targets", () => {
    const html = render(goal);
    for (const text of [
      "当前实际",
      "15.97万元",
      "50万元",
      "34.03万元",
      "31.94%",
      "账号完成明细",
      "贡献占比",
    ])
      expect(html).toContain(text);
    expect(html.indexOf("目标完成概览")).toBeLessThan(html.indexOf("账号完成明细"));
    expect(html).toContain('aria-valuenow="31.94"');
    expect(html).not.toContain("目标 ≥");
    expect(html).not.toContain("停播账号");
    expect(html).not.toContain("本期无记录");
    expect(html).not.toContain("按0计入");
  });
  it("shows partial actuals but withholds completion and misleading contribution percentages", () => {
    const html = render({
      ...goal,
      actual: 600000,
      source_result: {
        ...(goal.source_result ?? { status: "ready" as const, note: "" }),
        status: "partial",
      },
    });
    expect(html).toContain("已同步实际");
    expect(html).toContain("暂不判断达成");
    expect(html).not.toContain("120%");
    expect(html).not.toContain('role="progressbar"');
  });
  it("labels upper limits as usage and overage, not remaining achievement", () => {
    const html = render({
      ...goal,
      metric: "消耗",
      actual: 600000,
      binding: { ...binding, direction: "lte" },
    });
    for (const text of ["目标上限", "额度使用", "已超上限", "10万元", "120%"])
      expect(html).toContain(text);
    expect(html).not.toContain("距目标还差");
  });
  it("shows ROI gaps in percentage points and does not add percentage contributions", () => {
    const html = render({
      ...goal,
      kind: "ratio",
      unit: "%",
      metric: "实时净ROI",
      actual: 7.76,
      target: 12,
      source_result: {
        ...(goal.source_result ?? { status: "ready" as const, note: "" }),
        account_values_additive: false,
        account_values: [
          {
            id: "a",
            name: "ROI账号",
            actual: 7.76,
            as_of: "2026-10-14",
            status: "ready",
            note: "",
          },
        ],
      },
    });
    expect(html).toContain("4.24 个百分点");
    expect(html).toContain("门槛进度");
    expect(html).toContain("ROI账号");
    expect(html).not.toContain("贡献占比");
  });
  it("renders zero targets and missing actuals without invalid percentages", () => {
    for (const actual of [0, null]) {
      const html = render({ ...goal, target: 0, actual });
      expect(html).not.toMatch(/NaN|Infinity/);
      expect(html).toContain(actual === 0 ? "已达成" : "待同步");
    }
  });
});
