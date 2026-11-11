import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  permission: vi.fn(),
  select: vi.fn(),
  where: vi.fn(),
  execute: vi.fn(),
  departments: vi.fn(),
}));
vi.mock("@/modules/business-recruitment/authz", () => ({ resolveRecruitmentAccess: mocks.access }));
vi.mock("@/modules/permissions/server", () => ({
  resolvePermission: mocks.permission,
  getManagedDeptIds: mocks.departments,
}));
vi.mock("@/db/client", () => ({ db: { select: mocks.select, execute: mocks.execute } }));
import { getRecruitmentStatistics } from "@/modules/business-recruitment/statistics-server";

const owner = {
  id: "c",
  recruiter_user_id: "me",
  platform: "douyin",
  account_id: "account",
  uid: "uid",
  join_date: "2026-11-01",
  anchor_name: "主播",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ actorUserId: "me", scope: "all", isEmergency: false });
  mocks.permission.mockResolvedValue({ points: new Set() });
  mocks.departments.mockResolvedValue([]);
  mocks.select.mockImplementation(() => ({ from: () => ({ where: mocks.where }) }));
});
describe("招募统计服务端权限", () => {
  it("即使列表有all权限，非管理员也不能传别人的经纪人ID", async () => {
    await expect(
      getRecruitmentStatistics({ month: "2026-11", recruiterUserId: "other" }),
    ).rejects.toMatchObject({ httpStatus: 403 });
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("本人查询强制使用招募人ID，不能因带教/委托权限扩大", async () => {
    mocks.access.mockResolvedValue({
      actorUserId: "me",
      scope: "team",
      isEmergency: false,
      delegatedUserIds: ["other"],
      managedDeptIds: [],
    });
    mocks.where
      .mockResolvedValueOnce([owner])
      .mockResolvedValueOnce([{ userId: "me", name: "本人" }])
      .mockResolvedValueOnce([{ anchorId: "uid", accountId: "account", shortId: null }])
      .mockResolvedValueOnce([]);
    const result = await getRecruitmentStatistics({ month: "2026-11" });
    const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0]?.[0]);
    expect(query.sql).toContain('"recruiter_user_id"');
    expect(query.sql).not.toContain("operator_user_id");
    expect(query.params).toEqual(["me"]);
    expect(result.canViewAll).toBe(false);
    expect(result.recruiters).toEqual([{ userId: "me", name: "本人" }]);
  });
  it("管理员可看全部并筛选经纪人", async () => {
    mocks.permission.mockResolvedValue({ points: new Set(["user_manage"]) });
    mocks.where
      .mockResolvedValueOnce([
        owner,
        { ...owner, id: "c2", recruiter_user_id: "other", account_id: "another", uid: null },
      ])
      .mockResolvedValueOnce([
        { userId: "me", name: "本人" },
        { userId: "other", name: "其他" },
      ])
      .mockResolvedValueOnce([]);
    const result = await getRecruitmentStatistics({ month: "2026-11", recruiterUserId: "other" });
    expect(mocks.where.mock.calls[0]?.[0]).toBeUndefined();
    expect(result.canViewAll).toBe(true);
    expect(result.details.map((row) => row.recruiterUserId)).toEqual(["other"]);
  });
  it("部门负责人可筛选部门成员，候选数据查询仅包含本人及递归部门成员", async () => {
    mocks.access.mockResolvedValue({
      actorUserId: "me",
      scope: "team",
      managedDeptIds: ["dept"],
      isEmergency: false,
    });
    mocks.execute.mockResolvedValue([{ user_id: "child-member" }]);
    mocks.where
      .mockResolvedValueOnce([
        { ...owner, recruiter_user_id: "child-member", platform: "kuaishou" },
      ])
      .mockResolvedValueOnce([
        { userId: "me", name: "负责人" },
        { userId: "child-member", name: "子部门经纪人" },
      ]);
    const result = await getRecruitmentStatistics({
      month: "2026-11",
      recruiterUserId: "child-member",
    });
    const dialect = new PgDialect();
    const treeQuery = dialect.sqlToQuery(mocks.execute.mock.calls[0]?.[0]);
    expect(treeQuery.sql).toContain("WITH RECURSIVE");
    expect(treeQuery.sql).toContain("d.parent_id = m.dept_id");
    expect(treeQuery.params).toEqual(["dept"]);
    const query = dialect.sqlToQuery(mocks.where.mock.calls[0]?.[0]);
    expect(query.params).toEqual(["me", "child-member"]);
    expect(query.sql).toContain('"recruiter_user_id"');
    expect(query.sql).not.toContain("operator_user_id");
    expect(result.canViewAll).toBe(false);
    expect(result.canViewTeam).toBe(true);
    expect(result.recruiters.map((row) => row.userId)).toEqual(["me", "child-member"]);
    expect(result.details.map((row) => row.recruiterUserId)).toEqual(["child-member"]);
  });
  it("部门负责人不能伪造其他部门经纪人ID", async () => {
    mocks.access.mockResolvedValue({
      actorUserId: "me",
      scope: "team",
      managedDeptIds: ["dept"],
      isEmergency: false,
    });
    mocks.execute.mockResolvedValue([{ user_id: "child-member" }]);
    await expect(
      getRecruitmentStatistics({ month: "2026-11", recruiterUserId: "outsider" }),
    ).rejects.toMatchObject({ httpStatus: 403 });
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("非管理员的all范围仍需真实管理部门，不能获得全员统计", async () => {
    mocks.departments.mockResolvedValue(["dept"]);
    mocks.execute.mockResolvedValue([]);
    mocks.where.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const result = await getRecruitmentStatistics({ month: "2026-11" });
    expect(mocks.departments).toHaveBeenCalledWith("me");
    expect(result.canViewAll).toBe(false);
    expect(result.canViewTeam).toBe(true);
    expect(new PgDialect().sqlToQuery(mocks.where.mock.calls[0]?.[0]).params).toEqual(["me"]);
  });
  it("显式本人范围不会被管理部门扩大", async () => {
    mocks.access.mockResolvedValue({
      actorUserId: "me",
      scope: "self",
      managedDeptIds: ["dept"],
      isEmergency: false,
    });
    mocks.where.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const result = await getRecruitmentStatistics({ month: "2026-11" });
    expect(result.canViewTeam).toBe(false);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.departments).not.toHaveBeenCalled();
  });
  it("无模块权限直接拒绝，不返回人数或筛选项", async () => {
    mocks.access.mockResolvedValue({ actorUserId: "me", scope: "none", isEmergency: false });
    await expect(getRecruitmentStatistics({ month: "2026-11" })).rejects.toMatchObject({
      httpStatus: 403,
    });
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("身份冲突或非抖音账号不复用抖音直播数据", async () => {
    mocks.where
      .mockResolvedValueOnce([
        { ...owner, uid: "different" },
        { ...owner, id: "k", platform: "kuaishou" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { anchorId: "uid", accountId: "account" },
        { anchorId: "different" },
      ]);
    const result = await getRecruitmentStatistics({ month: "2026-11" });
    expect(result.unmatched).toBe(2);
    expect(result.details.every((row) => row.anchorId === null)).toBe(true);
    expect(mocks.where).toHaveBeenCalledTimes(3);
  });
});
