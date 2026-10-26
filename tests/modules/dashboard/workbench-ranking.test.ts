import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkbenchRankingFilters } from "@/modules/dashboard/workbench-ranking-types";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), scope: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/auth/page-auth", () => ({ getCurrentDingtalkUser: mocks.identity }));
vi.mock("@/modules/dashboard/scope", () => ({ resolveDashboardScope: mocks.scope }));
vi.mock("@/modules/dashboard/queries", () => ({ queryWorkbenchRanking: mocks.query }));
import { getWorkbenchRanking } from "@/modules/dashboard/workbench-ranking";
const filters = {
  project: "three",
  metric: "flow",
  date_from: "2026-09-01",
  date_to: "2026-09-07",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.identity.mockResolvedValue({ kind: "ok", isEmergency: false, dingtalkUserId: "operator" });
  mocks.scope.mockResolvedValue({ kind: "broker_ids", ids: ["owned"] });
  mocks.query.mockResolvedValue({ ...filters, rows: [], total: 0, latestDate: null });
});
describe("workbench live ranking boundaries", () => {
  it("rejects unauthenticated and unsynced users before querying facts", async () => {
    for (const [kind, status] of [
      ["unauth", 401],
      ["user_not_synced", 403],
    ] as const) {
      mocks.identity.mockResolvedValue({ kind });
      await expect(getWorkbenchRanking(filters)).rejects.toMatchObject({ httpStatus: status });
    }
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.scope).not.toHaveBeenCalled();
  });
  it("uses the existing broker scope and blocks users without dashboard access", async () => {
    await getWorkbenchRanking(filters);
    expect(mocks.query).toHaveBeenCalledWith(filters, { kind: "broker_ids", ids: ["owned"] });
    mocks.scope.mockResolvedValue({ kind: "reject" });
    await expect(getWorkbenchRanking(filters)).rejects.toMatchObject({ httpStatus: 403 });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
  it("allows the existing emergency account to view all products", async () => {
    mocks.identity.mockResolvedValue({ kind: "ok", isEmergency: true });
    await getWorkbenchRanking(filters);
    expect(mocks.scope).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledWith(filters, { kind: "all" });
  });
  it("rejects invalid dates, products, metrics, reversed and unbounded intervals", async () => {
    const invalid = [
      { date_from: "2026-02-30" },
      { date_from: "2026-9-01" },
      { date_to: "2026-08-31" },
      { date_to: "2027-10-01" },
      { project: "unknown" },
      { metric: "unknown" },
    ];
    for (const change of invalid) {
      expect(WorkbenchRankingFilters.safeParse({ ...filters, ...change }).success).toBe(false);
      await expect(getWorkbenchRanking({ ...filters, ...change })).rejects.toMatchObject({
        httpStatus: 400,
      });
    }
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
