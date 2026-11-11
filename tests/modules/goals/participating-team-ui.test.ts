// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { GoalsClient } from "@/app/(dashboard)/goals/goals-client";
import { WorkbenchGoals } from "@/app/(dashboard)/dashboard/_components/workbench-goals";
import type { Goal, GoalList } from "@/modules/goals";

vi.mock("@/lib/business-date", () => ({ businessDate: () => "2026-10-17" }));
const team: Goal = {
  id: "team-flow",
  period: "2026-10",
  project: "斗地主",
  line: "整体",
  dept_id: "d1",
  owner_ids: ["manager"],
  owner_labels: [],
  metric: "小手柄流水",
  unit: "元",
  kind: "sum",
  target: 1000000,
  actual: 400000,
  as_of: "2026-10-16",
  definition: "按周期累计",
  confirmed: true,
  parent_id: null,
  status: "published",
  version: 1,
  created_by: "manager",
  updated_at: "",
  evidence: "",
  read_only: true,
  source_result: { status: "ready", note: "团队累计" },
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
const own: Goal = {
  ...team,
  id: "personal-flow",
  owner_ids: ["u1"],
  read_only: undefined,
  team_parent_id: team.id,
  target: 200000,
  actual: 71000,
  status: "draft",
  binding: team.binding ? { ...team.binding, selection: "operators" } : null,
};
const data: GoalList = {
  items: [team, own],
  users: [
    { id: "manager", name: "丁友发", deptIds: [] },
    { id: "u1", name: "苏梓豪", deptIds: ["d1"] },
  ],
  departments: [{ id: "d1", name: "线下运营" }],
  access: { userId: "u1", scope: "self", fill: true, publish: false, canManageTeam: false },
};
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
function button(text: string, within: ParentNode = document) {
  const found = [...within.querySelectorAll("button")].find((b) => b.textContent === text);
  if (!found) throw new Error(`缺少按钮：${text}`);
  return found;
}
it("shows the team's full progress with only detail actions and keeps the own personal draft editable below it", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => data }));
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(createElement(GoalsClient, { initial: data })));
  expect(container.textContent).toContain("团队目标");
  expect(container.textContent).toContain("综合达成率 40%");
  expect(container.textContent).toContain("丁友发");
  await act(async () => button("展开指标", container).click());
  const teamRow = [...container.querySelectorAll("tr")].find(
    (r) =>
      r.textContent?.includes("距") === false &&
      r.querySelector("button")?.textContent === "小手柄流水",
  );
  expect(teamRow).toBeDefined();
  expect(teamRow?.textContent).toContain("100万元");
  expect(teamRow?.textContent).toContain("40万元");
  expect(teamRow?.textContent).not.toContain("已分配");
  expect([...(teamRow?.querySelectorAll("button") ?? [])].map((b) => b.textContent)).toEqual([
    "小手柄流水",
    "查看详情",
  ]);
  await act(async () => button("小手柄流水", container).click());
  expect(container.textContent).toContain("苏梓豪");
  expect(container.textContent).toContain("35.5%");
  expect(button("调整个人目标", container)).toBeDefined();
  await act(async () => button("查看详情", container).click());
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog?.textContent).toContain("40%");
  expect(dialog?.textContent).not.toContain("复制为新目标");
  expect(dialog?.textContent).not.toContain("查看调整记录");
  expect(dialog?.textContent).not.toContain("账号完成明细");
});
it("shows the participating published team on the workbench even when the personal draft is not yet published", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ ...data, items: [team] }) }),
  );
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(createElement(WorkbenchGoals, { refreshKey: 0 })));
  expect(container.textContent).toContain("团队目标");
  expect(container.textContent).toContain("40%");
  expect(container.textContent).not.toContain("暂无已发布目标");
});
