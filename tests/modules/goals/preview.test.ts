import { beforeEach, describe, expect, it, vi } from "vitest";
import { previousGoalPeriod } from "@/modules/goals/rules";
import type { GoalDefinition } from "@/modules/goals/types";

const m = vi.hoisted(() => ({
  identity: vi.fn(),
  select: vi.fn(),
  validate: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock("@/lib/auth/page-auth", () => ({ getCurrentDingtalkUser: m.identity }));
vi.mock("@/modules/permissions/server", () => ({
  resolvePermission: vi.fn(),
  getManagedDeptIds: vi.fn(),
}));
vi.mock("@/modules/aliases/server", () => ({ getDeptAliasMap: vi.fn() }));
vi.mock("@/db/client", () => ({ db: { select: m.select } }));
vi.mock("@/modules/goals/sources", () => ({
  validateGoalBinding: m.validate,
  resolveGoalSource: m.resolve,
}));
import { previewGoal } from "@/modules/goals/server";

const definition: GoalDefinition = {
  period: "2026-01",
  project: "斗地主",
  line: "整体",
  dept_id: "offline",
  owner_ids: ["u1"],
  owner_labels: [],
  metric: "小手柄流水",
  unit: "元",
  kind: "sum",
  target: 100000,
  definition: "周期累计",
  confirmed: false,
  parent_id: null,
  binding: {
    source: "douyin",
    product: "ddz",
    field: "controller_total_amount",
    selection: "operators",
    account_ids: [],
    direction: "gte",
    qualification: null,
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  m.identity.mockResolvedValue({ kind: "ok", dingtalkUserId: "admin", isEmergency: true });
  m.select.mockReturnValue({
    from: () => ({ where: async () => [{ id: "offline", depts: ["offline"] }] }),
  });
  m.resolve.mockImplementation(async (_actor, goal) => ({
    ...goal,
    actual: goal.period === "2025-12" ? 45000 : 12000,
    as_of: goal.period === "2025-12" ? "2025-12-31" : "2026-01-16",
    source_result: { status: "ready", note: "" },
  }));
});
describe("goal actual comparison previews", () => {
  it.each([
    ["2026-01", "2025-12"],
    ["2026-03", "2026-02"],
    ["2024-03", "2024-02"],
    ["2026-Q1", "2025-Q4"],
    ["2026-Q4", "2026-Q3"],
    ["2000-01", null],
  ])("uses the previous full matching period for %s", (period, expected) => {
    expect(previousGoalPeriod(period)).toBe(expected);
  });
  it("returns current and prior actuals with the same authorized filters and account caches", async () => {
    const result = await previewGoal(definition, "comparison");
    expect(result.actual).toBe(12000);
    expect(result.previous).toMatchObject({
      actual: 45000,
      period: "2025-12",
      as_of: "2025-12-31",
    });
    expect(m.validate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "admin" }),
      definition.binding,
      "offline",
      ["u1"],
    );
    for (const call of m.resolve.mock.calls) {
      expect(call[1]).toMatchObject({
        ...definition,
        period: expect.any(String),
        confirmed: true,
        status: "draft",
      });
    }
    expect(m.resolve.mock.calls[0]?.[2]).toBe(m.resolve.mock.calls[1]?.[2]);
    expect(m.resolve.mock.calls[0]?.[3]).toBe(m.resolve.mock.calls[1]?.[3]);
  });
  it("reads only the previous period for operator allocations and preserves zero/partial results", async () => {
    m.resolve.mockImplementationOnce(async (_actor, goal) => ({
      ...goal,
      actual: 0,
      source_result: { status: "partial", note: "指标待核对" },
    }));
    expect(await previewGoal(definition, "previous")).toMatchObject({
      period: "2025-12",
      actual: 0,
      source_result: { status: "partial" },
    });
    expect(m.resolve).toHaveBeenCalledOnce();
  });
  it("keeps the current-only endpoint compatible", async () => {
    const result = await previewGoal(definition);
    expect(result.previous).toBeUndefined();
    expect(m.resolve).toHaveBeenCalledOnce();
  });
  it("does not read either period when source authorization fails", async () => {
    m.validate.mockRejectedValueOnce(new Error("没有来源权限"));
    await expect(previewGoal(definition, "comparison")).rejects.toThrow("没有来源权限");
    expect(m.resolve).not.toHaveBeenCalled();
  });
  it("requires login even for read-only historical previews", async () => {
    m.identity.mockResolvedValueOnce({ kind: "unauth" });
    await expect(previewGoal(definition, "previous")).rejects.toThrow("请先登录");
    expect(m.resolve).not.toHaveBeenCalled();
  });
});
