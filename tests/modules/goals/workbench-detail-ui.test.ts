// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { WorkbenchGoals } from "@/app/(dashboard)/dashboard/_components/workbench-goals";
import type { Goal, GoalList } from "@/modules/goals";

vi.mock("@/lib/business-date", () => ({ businessDate: () => "2026-10-17" }));
const goal: Goal = {
  id: "team-flow",
  period: "2026-10",
  project: "斗地主",
  line: "整体",
  dept_id: "offline",
  owner_ids: ["u"],
  owner_labels: [],
  metric: "小手柄流水",
  unit: "元",
  kind: "sum",
  target: 1000,
  actual: 400,
  as_of: "2026-10-14",
  definition: "按周期累计",
  confirmed: true,
  parent_id: null,
  status: "published",
  version: 1,
  created_by: "u",
  updated_at: "",
  evidence: "",
  binding: {
    source: "douyin",
    product: "ddz",
    field: "controller_total_amount",
    selection: "accounts",
    account_ids: ["a", "b"],
    direction: "gte",
    qualification: null,
  },
  source_result: {
    status: "ready",
    note: "按账号累计",
    account_values_additive: true,
    account_values: [
      { id: "a", name: "贡献账号", actual: 400, as_of: "2026-10-14", status: "ready", note: "" },
      { id: "b", name: "零贡献账号", actual: 0, as_of: null, status: "no_record", note: "按0计入" },
    ],
  },
};
const data: GoalList = {
  items: [goal],
  users: [{ id: "u", name: "负责人", deptIds: ["offline"] }],
  departments: [{ id: "offline", name: "线下运营" }],
  access: { fill: true, publish: true, scope: "all", canManageTeam: true },
};
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("workbench goal details", () => {
  it("opens the chosen metric in a local dialog and closes it without navigation or another data request", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => data });
    vi.stubGlobal("fetch", fetch);
    const beforeUrl = window.location.href;
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(createElement(WorkbenchGoals, { refreshKey: 0 })));
    const expand = container.querySelector<HTMLButtonElement>('button[aria-expanded="false"]');
    expect(expand).not.toBeNull();
    await act(async () => expand?.click());
    const detail = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "查看详情",
    );
    expect(detail).toBeDefined();
    await act(async () => detail?.click());
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("小手柄流水");
    expect(dialog?.textContent).toContain("40%");
    expect(dialog?.textContent).toContain("贡献账号");
    expect(dialog?.textContent).not.toContain("零贡献账号");
    expect(dialog?.textContent).toContain("线下运营");
    expect(dialog?.textContent).not.toContain("复制为新目标");
    expect(dialog?.textContent).not.toContain("更新归属账号范围");
    expect(window.location.href).toBe(beforeUrl);
    expect(container.querySelector('a[href="/goals"]')?.textContent).toContain("目标管理");
    expect(fetch).toHaveBeenCalledTimes(1);
    const close = dialog?.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]');
    expect(close).not.toBeNull();
    await act(async () => close?.click());
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    expect(window.location.href).toBe(beforeUrl);
  });
});
