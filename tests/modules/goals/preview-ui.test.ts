// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MetricPicker } from "@/app/(dashboard)/goals/metric-picker";
import { GoalSplitDialog } from "@/app/(dashboard)/goals/goal-split-dialog";
import type { Goal, GoalDefinition } from "@/modules/goals/types";

const goal: Goal = {
  id: "00000000-0000-4000-8000-000000000001",
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
  definition: "周期累计",
  confirmed: true,
  parent_id: null,
  status: "published",
  actual: null,
  as_of: null,
  evidence: "",
  version: 1,
  created_by: "manager",
  updated_at: "",
  binding: {
    source: "douyin",
    product: "ddz",
    field: "controller_total_amount",
    selection: "all",
    account_ids: [],
    direction: "gte",
    qualification: null,
  },
};
const options = {
  users: [
    { id: "u1", name: "苏梓豪" },
    { id: "u2", name: "陈泰" },
  ],
  accounts: [
    { id: "a1", name: "甲账号", operator_ids: ["u1"] },
    { id: "a2", name: "乙账号", operator_ids: ["u2"] },
  ],
  allowAll: true,
  unassignedAccounts: 0,
};
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
async function mount(element: ReturnType<typeof createElement>) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(element);
  });
}
async function click(text: string) {
  const button = [...document.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(text),
  );
  if (!button) throw new Error(`缺少按钮 ${text}`);
  await act(async () => {
    button.click();
  });
}
function picker(value: GoalDefinition) {
  return createElement(MetricPicker, {
    value,
    onChange: vi.fn(),
    sourceOptions: { status: "ready", data: options, error: "" },
    additionalMetrics: [],
    onAdditionalMetricsChange: vi.fn(),
  });
}
describe("actual previews while setting targets", () => {
  it("lets an already assigned operator be selected for a target adjustment", async () => {
    const assigned: Goal = {
      ...goal,
      id: "00000000-0000-4000-8000-000000000003",
      owner_ids: ["u1"],
      target: 50000,
      team_parent_id: goal.id,
      binding: goal.binding
        ? { ...goal.binding, selection: "operators", account_ids: ["a1"] }
        : null,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => options }));
    await mount(
      createElement(GoalSplitDialog, {
        goals: [goal],
        allItems: [goal, assigned],
        departments: [{ id: "offline", name: "线下运营" }],
        onClose: vi.fn(),
        onSaved: vi.fn(),
      }),
    );
    const checkbox = document.querySelector<HTMLInputElement>('input[aria-label="选择苏梓豪"]');
    expect(checkbox?.disabled).toBe(false);
    expect(document.querySelector('input[aria-label="苏梓豪·小手柄流水目标值"]')).toBeNull();
    await act(async () => checkbox?.click());
    expect(
      document.querySelector<HTMLInputElement>('input[aria-label="苏梓豪·小手柄流水目标值"]')
        ?.value,
    ).toBe("50000");
  });

  it("shows both periods and retains comparison when only the target amount changes", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        item: {
          ...goal,
          actual: 12500,
          as_of: "2026-10-16",
          source_result: { status: "ready", note: "本期数据" },
          previous: {
            ...goal,
            period: "2026-09",
            actual: 40000,
            as_of: "2026-09-30",
            source_result: { status: "partial", note: "有指标待核对" },
          },
        },
      }),
    });
    vi.stubGlobal("fetch", fetch);
    await mount(picker(goal));
    await click("预览本期");
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body)).toMatchObject({ mode: "comparison" });
    const current = document.querySelector('[aria-label="本期完成"]');
    const previous = document.querySelector('[aria-label="上月完成"]');
    expect(current?.textContent).toContain("1.25万元");
    expect(previous?.textContent).toContain("4万元");
    expect(previous?.textContent).toContain("2026-09-01 — 2026-09-30");
    expect(previous?.textContent).toContain("部分数据");
    await act(async () => {
      root?.render(picker({ ...goal, target: 200000 }));
    });
    expect(document.querySelector('[aria-label="上月完成"]')).not.toBeNull();
    await act(async () => {
      root?.render(picker({ ...goal, period: "2026-11" }));
    });
    expect(document.querySelector('[aria-label="上月完成"]')).toBeNull();
  });
  it("previews each operator and each inherited metric without saving or changing target inputs", async () => {
    const second: Goal = {
      ...goal,
      id: "00000000-0000-4000-8000-000000000002",
      metric: "音浪",
      unit: "音浪",
      binding: goal.binding ? { ...goal.binding, field: "income" } : null,
    };
    const fetch = vi.fn().mockImplementation(async (_url, init) => {
      if (!init?.method) return { ok: true, json: async () => options };
      const body = JSON.parse(init.body);
      expect(body).toMatchObject({
        action: "preview",
        mode: "previous",
        definition: {
          period: "2026-10",
          dept_id: "offline",
          project: "斗地主",
          target: 0,
          binding: { selection: "operators", account_ids: [] },
        },
      });
      const own = body.definition.owner_ids[0] === "u1";
      return {
        ok: true,
        json: async () => ({
          item: {
            ...body.definition,
            period: "2026-09",
            actual: own ? 30000 : 0,
            as_of: own ? "2026-09-30" : null,
            source_result: { status: "ready", note: own ? "" : "本期无记录，按0计入" },
          },
        }),
      };
    });
    vi.stubGlobal("fetch", fetch);
    const saved = vi.fn();
    await mount(
      createElement(GoalSplitDialog, {
        goals: [goal, second],
        allItems: [goal, second],
        departments: [{ id: "offline", name: "线下运营" }],
        onClose: vi.fn(),
        onSaved: saved,
      }),
    );
    await click("预览上月");
    const rows = [...document.querySelectorAll("tbody tr")];
    expect(rows[0]?.textContent).toContain("苏梓豪");
    expect(rows[0]?.querySelectorAll('[aria-label="上月完成"]')).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("3万元");
    expect(rows[1]?.textContent).toContain("0元");
    expect(document.querySelector('input[type="number"]')?.getAttribute("value")).toBe("");
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(saved).not.toHaveBeenCalled();
  });
});
