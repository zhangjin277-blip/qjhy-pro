// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PersonalGoalDialog } from "@/app/(dashboard)/goals/personal-goal-dialog";
import type { GoalList } from "@/modules/goals";
import type { PersonalTeamOption } from "@/modules/goals/types";

const data: GoalList = {
  items: [],
  users: [{ id: "u1", name: "苏梓豪", deptIds: ["offline"] }],
  departments: [
    { id: "online", name: "线上运营" },
    { id: "offline", name: "线下运营" },
  ],
  access: { userId: "u1", fill: true, publish: false, scope: "team", canManageTeam: false },
};
const team: PersonalTeamOption = {
  id: "team-flow",
  period: "2026-10",
  project: "斗地主",
  dept_id: "offline",
  department: "线下运营",
  owners: ["丁友发"],
  source: "douyin",
  product: "ddz",
  accounts: [{ id: "own-account", name: "本人账号" }],
  metrics: [
    {
      id: "team-flow",
      version: 1,
      metric: "小手柄流水",
      unit: "元",
      kind: "sum",
      target: 100000,
      weight: 100,
      definition: "按周期累计",
      available: 100000,
      existing: null,
    },
  ],
};
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
function selectFor(text: string) {
  const label = [...document.querySelectorAll("label")].find((l) =>
    l.textContent?.startsWith(text),
  );
  const select = label?.querySelector("select");
  if (!select) throw new Error(`缺少选择框：${text}`);
  return select;
}
async function renderDialog(fetch: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetch);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      createElement(PersonalGoalDialog, {
        data,
        departments: data.departments,
        initialPeriod: "2026-10",
        onClose: vi.fn(),
        onTeam: vi.fn(),
        onSaved: vi.fn(),
      }),
    );
  });
  await act(async () => {
    const project = selectFor("项目");
    project.value = "斗地主";
    project.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
describe("personal goal filing by an ordinary operator", () => {
  it("defaults to the own department, fixes the owner and loads the matching team and inherited metrics", async () => {
    const fetch = vi.fn().mockImplementation(async (url: string) => {
      const query = new URL(url, "http://localhost").searchParams;
      expect(query.get("dept")).toBe("offline");
      return {
        ok: true,
        json: async () =>
          query.has("personal-teams")
            ? { items: [team] }
            : { users: [{ id: "u1", name: "苏梓豪" }], accounts: team.accounts },
      };
    });
    await renderDialog(fetch);
    const department = selectFor("归属部门");
    expect(department.value).toBe("offline");
    expect(department.selectedOptions[0]?.textContent).toBe("线下运营");
    expect([...department.options].some((o) => o.value === "online")).toBe(false);
    expect(selectFor("负责人（运营）").disabled).toBe(true);
    expect(selectFor("负责人（运营）").value).toBe("u1");
    expect(selectFor("关联团队目标").value).toBe(team.id);
    expect(selectFor("关联团队目标").disabled).toBe(false);
    expect(document.querySelector('input[type="number"]')).not.toBeNull();
    expect(document.body.textContent).toContain("小手柄流水");
    expect(document.querySelector('[aria-label="目标类型"]')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
    const teamQuery = new URL(fetch.mock.calls[1]?.[0], "http://localhost").searchParams;
    expect(Object.fromEntries(teamQuery)).toMatchObject({
      "personal-teams": "1",
      period: "2026-10",
      project: "斗地主",
      dept: "offline",
      owner: "u1",
      dataset: "ddz",
    });
  });
  it("shows a real team request error without misleadingly saying the team has not been published", async () => {
    const fetch = vi.fn().mockImplementation(async (url: string) => {
      const isTeam = new URL(url, "http://localhost").searchParams.has("personal-teams");
      return {
        ok: !isTeam,
        json: async () =>
          isTeam
            ? { error: "团队目标读取失败，请重试" }
            : { users: [{ id: "u1", name: "苏梓豪" }], accounts: team.accounts },
      };
    });
    await renderDialog(fetch);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("团队目标读取失败");
    expect(document.body.textContent).not.toContain("请负责人先发布");
    expect(selectFor("关联团队目标").disabled).toBe(true);
  });
});
