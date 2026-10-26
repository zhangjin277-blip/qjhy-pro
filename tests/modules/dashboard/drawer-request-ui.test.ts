// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  DashboardDrawer,
  type DrawerOpenPayload,
} from "@/app/(dashboard)/dashboard/_components/dashboard-drawer";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("recharts", () => ({
  Area: () => null,
  AreaChart: () => null,
  CartesianGrid: () => null,
  Line: () => null,
  ResponsiveContainer: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
const payload: DrawerOpenPayload = {
  project: "three",
  metric: "flow",
  date_from: "2026-09-20",
  date_to: "2026-10-19",
};
async function render(value: DrawerOpenPayload | null) {
  if (!root) {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const element = document.createElement("div");
    document.body.append(element);
    root = createRoot(element);
  }
  await act(async () => {
    root?.render(createElement(DashboardDrawer, { payload: value, onClose: vi.fn() }));
  });
}
describe("business drawer request lifecycle", () => {
  it("sends only one request for the clicked metric on first open and again on reopening", async () => {
    const fetch = vi.fn().mockReturnValue(new Promise(() => undefined));
    vi.stubGlobal("fetch", fetch);
    await render(payload);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[0]).toContain("metric=flow");
    await render(null);
    expect(fetch.mock.calls[0]?.[1].signal.aborted).toBe(true);
    await render({ ...payload, metric: "watch_uv" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]?.[0]).toContain("metric=watch_uv");
  });
  it("cancels the old context and uses only the new clicked metric when changing project", async () => {
    const fetch = vi.fn().mockReturnValue(new Promise(() => undefined));
    vi.stubGlobal("fetch", fetch);
    await render(payload);
    await render({ ...payload, project: "ddz", metric: "show_uv" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]?.[1].signal.aborted).toBe(true);
    expect(fetch.mock.calls[1]?.[0]).toContain("project=ddz");
    expect(fetch.mock.calls[1]?.[0]).toContain("metric=show_uv");
  });
});
