// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useGoalList } from "@/app/(dashboard)/goals/use-goal-list";
import type { GoalList } from "@/modules/goals";

const initial: GoalList = {
  items: [],
  users: [],
  departments: [],
  access: { userId: "u1", scope: "self", fill: false, publish: false, canManageTeam: false },
};
let root: Root | undefined;
let state: ReturnType<typeof useGoalList>;
function Harness({ period }: { period: string }) {
  state = useGoalList(initial, period);
  return createElement("p", null, state.loading ? "loading" : state.data.access.userId);
}
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
it("loads the selected period and rejects an old response after switching periods", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const pending: ((value: unknown) => void)[] = [];
  const fetch = vi.fn((url: string) => {
    void url;
    return new Promise((resolve) => pending.push(resolve));
  });
  vi.stubGlobal("fetch", fetch);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(createElement(Harness, { period: "2026-10" })));
  expect(container.textContent).toBe("loading");
  expect(fetch.mock.calls[0]?.[0]).toBe("/api/goals?resolve-period=2026-10");
  await act(async () => root?.render(createElement(Harness, { period: "2026-Q4" })));
  await act(async () =>
    pending[1]?.({
      ok: true,
      json: async () => ({ ...initial, access: { ...initial.access, userId: "quarter" } }),
    }),
  );
  expect(container.textContent).toBe("quarter");
  await act(async () => pending[0]?.({ ok: true, json: async () => initial }));
  expect(container.textContent).toBe("quarter");
});
it("keeps a failed period unloaded and supports retry", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "稍后重试" }) })
    .mockResolvedValueOnce({ ok: true, json: async () => initial });
  vi.stubGlobal("fetch", fetch);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(createElement(Harness, { period: "2026-11" })));
  expect(state.error).toBe("稍后重试");
  expect(state.loading).toBe(true);
  await act(async () => state.reload());
  expect(state.loading).toBe(false);
  expect(state.error).toBe("");
});
