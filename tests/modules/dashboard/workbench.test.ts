import { beforeEach, describe, expect, it, vi } from "vitest";
import { summarizeAttendance } from "@/modules/dashboard/workbench-rules";
import { AppError } from "@/lib/errors";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  permission: vi.fn(),
  procurement: vi.fn(),
  notices: vi.fn(),
  dbSelect: vi.fn(),
  videoCounts: vi.fn(),
  attendance: vi.fn(),
  core: vi.fn(),
}));
vi.mock("@/lib/auth/page-auth", () => ({ getCurrentDingtalkUser: mocks.identity }));
vi.mock("@/modules/permissions/server", () => ({ resolvePermission: mocks.permission }));
vi.mock("@/modules/procurement/server", () => ({ requireProcurementAccess: mocks.procurement }));
vi.mock("@/modules/editing-task/server", () => ({
  buildEditingScopeWhere: vi.fn(),
  queryStatusCounts: mocks.videoCounts,
  queryTodaySummary: vi.fn(),
}));
vi.mock("@/modules/attendance/server", () => ({ dispatchAttendanceRequest: mocks.attendance }));
vi.mock("@/db/client", () => ({ db: { select: mocks.dbSelect } }));
vi.mock("@/modules/dashboard/notices", () => ({ getWorkbenchNotices: mocks.notices }));
vi.mock("@/modules/dashboard/queries", () => ({ getCoreKpis: mocks.core }));
vi.mock("@/modules/dashboard/scope", () => ({
  resolveDashboardScope: vi.fn().mockResolvedValue({ kind: "reject" }),
}));
import { getWorkbench } from "@/modules/dashboard/workbench";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.identity.mockResolvedValue({ kind: "ok", dingtalkUserId: "employee", isEmergency: false });
  mocks.permission.mockResolvedValue({ scope: "none", points: new Set() });
  mocks.procurement.mockRejectedValue(new AppError("FORBIDDEN", "denied", 403));
  mocks.notices.mockResolvedValue({ items: [], canPublish: false });
});

describe("workbench authorization and failure isolation", () => {
  it("rejects unauthenticated callers before querying business data", async () => {
    mocks.identity.mockResolvedValue({ kind: "unauth" });
    await expect(getWorkbench()).rejects.toMatchObject({ httpStatus: 401 });
    expect(mocks.dbSelect).not.toHaveBeenCalled();
    expect(mocks.notices).not.toHaveBeenCalled();
  });
  it("does not query restricted modules and keeps announcements available", async () => {
    const data = await getWorkbench();
    expect(data.approvals.data).toBeNull();
    expect(data.videos.data).toBeNull();
    expect(data.attendance.data).toBeNull();
    expect(data.business.data).toBeNull();
    expect(data.notices.data?.items).toEqual([]);
    expect(mocks.dbSelect).not.toHaveBeenCalled();
    expect(mocks.videoCounts).not.toHaveBeenCalled();
    expect(mocks.attendance).not.toHaveBeenCalled();
    expect(mocks.core).not.toHaveBeenCalled();
  });
  it("isolates a failed announcement store from the other panels", async () => {
    mocks.notices.mockRejectedValue(new Error("database unavailable"));
    const log = vi.spyOn(console, "error").mockReturnValue(undefined);
    const data = await getWorkbench();
    expect(data.notices.error).toContain("暂时无法加载");
    expect(data.approvals.error).toContain("权限");
    log.mockRestore();
  });
  it("scopes both procurement counters and previews to self and hides approval tasks without the approve point", async () => {
    mocks.procurement.mockResolvedValue({
      userId: "employee",
      permission: { scope: "self", points: new Set(["create"]) },
    });
    const countWhere = vi.fn().mockResolvedValue([{ pending: 8, mine: 2 }]);
    const mineWhere = vi.fn().mockReturnValue({ orderBy: () => ({ limit: async () => [] }) });
    mocks.dbSelect
      .mockReturnValueOnce({ from: () => ({ where: countWhere }) })
      .mockReturnValueOnce({ from: () => ({ where: mineWhere }) });
    const data = await getWorkbench();
    expect(data.approvals.data).toMatchObject({
      pendingCount: 0,
      mineCount: 2,
      pending: [],
      canApprove: false,
    });
    expect(mocks.dbSelect).toHaveBeenCalledTimes(2);
    const dialect = new PgDialect();
    for (const where of [countWhere, mineWhere]) {
      const query = dialect.sqlToQuery(where.mock.calls[0]?.[0]);
      expect(query.sql).toContain("submitter_user_id");
      expect(query.params).toContain("employee");
    }
  });
});

describe("attendance brief", () => {
  const normal = {
    dingtalk_userid: "a",
    total_days: 1,
    normal_days: 1,
    late_days: 0,
    early_leave_days: 0,
    missing_punch_days: 0,
    absent_days_count: 0,
    verified_days: 0,
  };
  it("counts a person with multiple anomalies once and excludes verified/rest records", () => {
    const result = summarizeAttendance([
      normal,
      { ...normal, dingtalk_userid: "b", normal_days: 0, late_days: 1, missing_punch_days: 1 },
      { ...normal, dingtalk_userid: "c", normal_days: 0, late_days: 1, verified_days: 1 },
      { ...normal, dingtalk_userid: "rest", total_days: 0, normal_days: 0 },
    ]);
    expect(result).toMatchObject({ recorded: 3, normal: 1, pending: 1, late: 1, missing: 1 });
  });
  it("does not invent expected attendance or a normal personal status when no records exist", () => {
    expect(summarizeAttendance([])).toEqual({
      recorded: 0,
      normal: 0,
      pending: 0,
      late: 0,
      missing: 0,
      early: 0,
      absent: 0,
    });
  });
});
