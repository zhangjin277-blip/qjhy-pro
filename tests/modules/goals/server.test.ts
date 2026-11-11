import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const m = vi.hoisted(() => ({
  identity: vi.fn(),
  permission: vi.fn(),
  managed: vi.fn(),
  select: vi.fn(),
  txSelect: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  execute: vi.fn(),
  sourceOptions: vi.fn(),
}));
vi.mock("@/lib/auth/page-auth", () => ({ getCurrentDingtalkUser: m.identity }));
vi.mock("@/modules/permissions/server", () => ({
  resolvePermission: m.permission,
  getManagedDeptIds: m.managed,
}));
vi.mock("@/modules/aliases/server", () => ({ getDeptAliasMap: async () => new Map() }));
vi.mock("@/modules/goals/sources", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/goals/sources")>()),
  goalSourceOptions: m.sourceOptions,
}));
vi.mock("@/db/client", () => ({
  db: {
    select: m.select,
    execute: m.execute,
    transaction: async (cb: (tx: unknown) => unknown) =>
      cb({
        select: m.txSelect,
        execute: m.execute,
        update: () => ({ set: (value: unknown) => ({ where: () => m.update(value) }) }),
        insert: () => ({ values: m.insert }),
      }),
  },
}));
import {
  goalScopeSql,
  listGoals,
  mutateGoal,
  savePersonalGoals,
  personalTeamOptions,
  splitTeamGoals,
  publishTeamGoals,
} from "@/modules/goals/server";
import type { GoalAccess } from "@/modules/goals/types";
import { participatingTeamScopeSql } from "@/modules/goals/visibility";
import * as goalSources from "@/modules/goals/sources";
const row = {
  id: "00000000-0000-4000-8000-000000000001",
  period: "2026-10",
  project: "棋牌",
  line: "线下",
  dept_id: null,
  owner_ids: ["u1"],
  owner_labels: [],
  binding: null,
  metric: "流水",
  unit: "元",
  kind: "sum",
  target: 330000,
  actual: null,
  as_of: null,
  evidence: "",
  definition: "核对直播账号范围",
  confirmed: true,
  parent_id: null,
  team_parent_id: null,
  status: "published",
  version: 1,
  created_by: "u1",
  updated_at: new Date(),
};
function query(rows: unknown[], onWhere?: (condition: unknown) => void) {
  const q = {
    from: () => q,
    where: (condition: unknown) => {
      onWhere?.(condition);
      return q;
    },
    orderBy: async () => rows,
    for: async () => rows,
    limit: async () => rows,
    then: (resolve: (v: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
  };
  return q;
}
function existingTeamQueries(before: Record<string, unknown>) {
  m.txSelect
    .mockReturnValueOnce(query([before]))
    .mockReturnValueOnce(query([before]))
    .mockReturnValueOnce(query([before]))
    .mockReturnValueOnce(query([]));
}
beforeEach(() => {
  vi.resetAllMocks();
  m.identity.mockResolvedValue({ kind: "ok", dingtalkUserId: "admin", isEmergency: true });
  m.permission.mockResolvedValue({ scope: "self", points: new Set(["view", "fill"]) });
  m.select.mockReturnValue(query([{ name: "员工" }]));
  m.txSelect.mockReturnValue(query([]));
});
describe("goals server authorization and mutation", () => {
  it("keeps related definitions but resolves live sources only in the selected period", async () => {
    const binding = {
      source: "buyu",
      product: "product_buyu_all",
      field: "消耗",
      selection: "all",
      account_ids: [],
    };
    m.select
      .mockReturnValueOnce(
        query([
          { ...row, id: "october", binding, actual: 123 },
          { ...row, id: "november", period: "2026-11", binding, actual: 456 },
          { ...row, id: "quarter", period: "2026-Q4", binding, target: 900 },
        ]),
      )
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(query([]));
    const resolve = vi
      .spyOn(goalSources, "resolveGoalSource")
      .mockImplementation(async (_actor, goal) => ({ ...goal, actual: 789 }));
    try {
      const result = await listGoals(undefined, false, { resolvePeriod: "2026-11" });
      expect(result.items).toHaveLength(3);
      expect(resolve).toHaveBeenCalledTimes(1);
      expect(result.items.find((goal) => goal.id === "november")?.actual).toBe(789);
      expect(result.items.find((goal) => goal.id === "october")?.actual).toBeNull();
      expect(result.items.find((goal) => goal.id === "quarter")?.target).toBe(900);
    } finally {
      resolve.mockRestore();
    }
  });
  it("redacts participating team accounts even when the first screen skips source resolution", async () => {
    m.identity.mockResolvedValue({ kind: "ok", dingtalkUserId: "u1", isEmergency: false });
    m.permission.mockResolvedValue({ scope: "self", points: new Set(["view"]) });
    m.select
      .mockReturnValueOnce(query([{ name: "本人" }]))
      .mockReturnValueOnce(
        query([
          {
            ...row,
            owner_ids: ["manager"],
            actual: 123,
            binding: {
              source: "douyin",
              product: "ddz",
              field: "controller_total_amount",
              selection: "accounts",
              account_ids: ["private-account"],
            },
          },
        ]),
      )
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(query([]));
    const result = await listGoals(undefined, false, { resolveSources: false });
    expect(result.items[0]).toMatchObject({
      read_only: true,
      actual: null,
      binding: { account_ids: [] },
    });
    expect(JSON.stringify(result)).not.toContain("private-account");
    expect(m.permission).toHaveBeenCalledTimes(1);
  });
  it("returns a participating team as read-only with its owner name but no extra personnel department scope", async () => {
    m.identity.mockResolvedValue({ kind: "ok", dingtalkUserId: "u1", isEmergency: false });
    m.permission.mockResolvedValue({ scope: "self", points: new Set(["view", "fill"]) });
    m.select
      .mockReturnValueOnce(query([{ name: "苏梓豪" }]))
      .mockReturnValueOnce(query([{ ...row, owner_ids: ["manager"], dept_id: "d1" }]))
      .mockReturnValueOnce(
        query([
          { id: "u1", name: "苏梓豪", deptIds: ["d1"] },
          { id: "manager", name: "丁友发", deptIds: ["d1", "private-dept"] },
        ]),
      )
      .mockReturnValueOnce(query([{ id: "d1", name: "线下运营" }]));
    const result = await listGoals("2026-10");
    expect(result.items[0]).toMatchObject({ read_only: true, owner_ids: ["manager"] });
    expect(result.users).toContainEqual({ id: "manager", name: "丁友发", deptIds: [] });
    expect(result.users).toContainEqual({ id: "u1", name: "苏梓豪", deptIds: ["d1"] });
    expect(result.access.canManageTeam).toBe(false);
  });
  it("keeps participation out of write/history scope and delegated views", () => {
    const actor: GoalAccess = {
      userId: "u1",
      name: "运营",
      scope: "self",
      points: ["view", "fill"],
      deptIds: [],
      delegatedIds: null,
    };
    const dialect = new PgDialect();
    const writeScope = dialect.sqlToQuery(goalScopeSql(actor));
    expect(writeScope.params).toEqual(["u1"]);
    expect(writeScope.sql).not.toContain("EXISTS");
    const participation = dialect.sqlToQuery(participatingTeamScopeSql(actor));
    expect(participation.params).toEqual(["u1"]);
    expect(participation.sql).toContain("participant.deleted_at IS NULL");
    expect(participation.sql).toContain("team_root.status = 'published'");
    expect(
      dialect.sqlToQuery(participatingTeamScopeSql({ ...actor, delegatedIds: ["u2"] })).sql,
    ).toBe("false");
    expect(dialect.sqlToQuery(participatingTeamScopeSql({ ...actor, scope: "none" })).sql).toBe(
      "false",
    );
  });
  it.each([{ managedIds: [] }, { managedIds: ["managed-dept"] }])(
    "includes the user's own departments without granting management or leaking colleagues' other departments (%j)",
    async ({ managedIds }) => {
      m.identity.mockResolvedValue({ kind: "ok", dingtalkUserId: "u1", isEmergency: false });
      m.permission.mockResolvedValue({ scope: "team", points: new Set(["view", "fill"]) });
      m.managed.mockResolvedValue(managedIds);
      const where = vi.fn();
      m.select
        .mockReturnValueOnce(query([{ name: "苏梓豪" }]))
        .mockReturnValueOnce(query([]))
        .mockReturnValueOnce(
          query([
            { id: "u1", name: "苏梓豪", deptIds: ["own-dept"] },
            ...(managedIds.length
              ? [{ id: "u2", name: "组员", deptIds: ["managed-dept", "unrelated-dept"] }]
              : []),
          ]),
        )
        .mockReturnValueOnce(query([{ id: "own-dept", name: "线下运营" }], where));
      const result = await listGoals("2026-10");
      expect(result.departments).toContainEqual({ id: "own-dept", name: "线下运营" });
      expect(result.access.canManageTeam).toBe(managedIds.length > 0);
      const sqlQuery = new PgDialect().sqlToQuery(where.mock.calls[0]?.[0]);
      expect(sqlQuery.params).toEqual([...managedIds, "own-dept"]);
      expect(sqlQuery.params).not.toContain("unrelated-dept");
    },
  );
  it("lets a non-leader link a published team in their own department with only their own accounts", async () => {
    m.identity.mockResolvedValue({ kind: "ok", dingtalkUserId: "u1", isEmergency: false });
    m.permission.mockResolvedValue({ scope: "team", points: new Set(["view", "fill"]) });
    m.managed.mockResolvedValue([]);
    m.select
      .mockReturnValueOnce(query([{ name: "苏梓豪" }]))
      .mockReturnValueOnce(query([{ id: "u1", depts: ["d1"] }]))
      .mockReturnValueOnce(query([{ id: "d1" }]));
    m.sourceOptions.mockResolvedValue({
      users: [{ id: "u1", name: "苏梓豪" }],
      accounts: [
        { id: "own-account", name: "本人账号", operator_ids: ["u1"] },
        { id: "other-account", name: "其他运营账号", operator_ids: ["u2"] },
      ],
    });
    m.txSelect
      .mockReturnValueOnce(
        query([
          {
            ...row,
            project: "斗地主",
            dept_id: "d1",
            owner_ids: ["manager"],
            metric: "小手柄流水",
            actual: 123456,
            binding: {
              source: "douyin",
              product: "ddz",
              field: "controller_total_amount",
              selection: "all",
              account_ids: [],
              direction: "gte",
              qualification: null,
            },
          },
        ]),
      )
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(query([{ name: "线下运营" }]))
      .mockReturnValueOnce(query([{ name: "丁友发" }]));
    const options = await personalTeamOptions({
      period: row.period,
      project: "斗地主",
      dept_id: "d1",
      owner_id: "u1",
    });
    expect(options).toHaveLength(1);
    expect(options[0]?.accounts).toEqual([{ id: "own-account", name: "本人账号" }]);
    expect(options[0]?.metrics[0]).toMatchObject({ metric: "小手柄流水", target: 330000 });
    expect(options[0]?.metrics[0]).not.toHaveProperty("actual");
    expect(m.update).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });
  it("rejects a personal department that the operator does not belong to", async () => {
    m.identity.mockResolvedValue({ kind: "ok", dingtalkUserId: "u1", isEmergency: false });
    m.permission.mockResolvedValue({ scope: "team", points: new Set(["view", "fill"]) });
    m.managed.mockResolvedValue([]);
    m.select
      .mockReturnValueOnce(query([{ name: "苏梓豪" }]))
      .mockReturnValueOnce(query([{ id: "u1", depts: ["d1"] }]));
    await expect(
      personalTeamOptions({ period: row.period, project: "斗地主", dept_id: "d2", owner_id: "u1" }),
    ).rejects.toThrow("所选负责人必须属于所选部门");
    expect(m.txSelect).not.toHaveBeenCalled();
  });
  it("rejects a newly added personal draft before updating the team or any child", async () => {
    const team = { ...row, status: "draft" };
    m.txSelect
      .mockReturnValueOnce(query([team]))
      .mockReturnValueOnce(query([team]))
      .mockReturnValueOnce(
        query([{ ...team, id: "00000000-0000-4000-8000-000000000002", team_parent_id: row.id }]),
      );
    await expect(
      publishTeamGoals({
        action: "publish-team",
        goal: { id: row.id, version: row.version },
        children: [],
        reason: "确认发布",
      }),
    ).rejects.toMatchObject({ httpStatus: 409 });
    expect(m.execute).toHaveBeenCalledOnce();
    expect(m.update).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });
  it("rejects publishing without permission or management before entering a transaction", async () => {
    m.identity.mockResolvedValue({ kind: "ok", dingtalkUserId: "u1", isEmergency: false });
    await expect(publishTeamGoals({})).rejects.toMatchObject({ httpStatus: 403 });
    m.permission.mockResolvedValue({ scope: "self", points: new Set(["view", "publish"]) });
    await expect(publishTeamGoals({})).rejects.toMatchObject({ httpStatus: 403 });
    expect(m.execute).not.toHaveBeenCalled();
    expect(m.txSelect).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });
  it.each(["team", "all"])("allows %s managers to choose an authorized operator", async (scope) => {
    m.identity.mockResolvedValue({ kind: "ok", dingtalkUserId: "manager", isEmergency: false });
    m.permission.mockResolvedValue({
      scope,
      points: new Set(["view", "fill"]),
      delegatedUserIds: null,
    });
    m.managed.mockResolvedValue(["d1"]);
    m.select
      .mockReturnValueOnce(query([{ name: "负责人" }]))
      .mockReturnValueOnce(query([{ id: "u2", depts: ["d1"] }]))
      .mockReturnValueOnce(query([{ id: "d1" }]));
    await expect(
      personalTeamOptions({ period: row.period, project: "斗地主", dept_id: "d1", owner_id: "u2" }),
    ).resolves.toEqual([]);
    expect(m.txSelect).toHaveBeenCalledOnce();
  });
  it("does not let a department leader assign a goal in an unrelated department", async () => {
    m.identity.mockResolvedValue({ kind: "ok", dingtalkUserId: "manager", isEmergency: false });
    m.permission.mockResolvedValue({
      scope: "team",
      points: new Set(["view", "fill"]),
      delegatedUserIds: null,
    });
    m.managed.mockResolvedValue(["d1"]);
    await expect(
      personalTeamOptions({
        period: row.period,
        project: "斗地主",
        dept_id: "other-dept",
        owner_id: "u2",
      }),
    ).rejects.toMatchObject({ httpStatus: 403 });
    expect(m.txSelect).not.toHaveBeenCalled();
  });
  it.each(["self", "team"])(
    "rejects forged personal submissions by a %s operator before reading or writing teams",
    async (scope) => {
      m.identity.mockResolvedValue({ kind: "ok", dingtalkUserId: "u1", isEmergency: false });
      m.permission.mockResolvedValue({ scope, points: new Set(["view", "fill"]) });
      m.managed.mockResolvedValue([]);
      await expect(
        savePersonalGoals({
          action: "save-personal-goals",
          team_id: row.id,
          owner_id: "u2",
          targets: [{ goal: { id: row.id, version: 1 }, target: 100, edit: null }],
          reason: "填报",
        }),
      ).rejects.toMatchObject({ httpStatus: 403 });
      await expect(
        personalTeamOptions({
          period: row.period,
          project: "斗地主",
          dept_id: null,
          owner_id: "u2",
        }),
      ).rejects.toMatchObject({ httpStatus: 403 });
      await expect(splitTeamGoals({})).rejects.toMatchObject({ httpStatus: 403 });
      expect(m.txSelect).not.toHaveBeenCalled();
      expect(m.execute).not.toHaveBeenCalled();
      expect(m.update).not.toHaveBeenCalled();
      expect(m.insert).not.toHaveBeenCalled();
    },
  );
  it("prevents delegated viewers from changing another employee's existing draft", async () => {
    m.identity.mockResolvedValue({ kind: "ok", dingtalkUserId: "u1", isEmergency: false });
    m.permission.mockResolvedValue({
      scope: "all",
      points: new Set(["view", "fill"]),
      delegatedUserIds: ["u2"],
    });
    m.txSelect.mockReturnValueOnce(query([{ ...row, status: "draft", owner_ids: ["u2"] }]));
    await expect(
      mutateGoal({ action: "delete", id: row.id, version: 1, reason: "删除" }),
    ).rejects.toMatchObject({ httpStatus: 403 });
    expect(m.update).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });
  it("rejects guests and no-view users before any business or employee query", async () => {
    m.identity.mockResolvedValue({ kind: "unauth" });
    await expect(listGoals()).rejects.toMatchObject({ httpStatus: 401 });
    m.identity.mockResolvedValue({ kind: "ok", dingtalkUserId: "u1", isEmergency: false });
    m.permission.mockResolvedValue({ scope: "all", points: new Set(["fill"]) });
    await expect(listGoals()).rejects.toMatchObject({ httpStatus: 403 });
    expect(m.select).not.toHaveBeenCalled();
  });
  it("constrains ownership in SQL, including delegated and empty-team scopes", () => {
    const actor: GoalAccess = {
      userId: "u1",
      name: "员工",
      scope: "self",
      points: ["view"],
      deptIds: [],
      delegatedIds: null,
    };
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(goalScopeSql(actor)).params).toEqual(["u1"]);
    expect(
      dialect.sqlToQuery(goalScopeSql({ ...actor, scope: "team", deptIds: ["deptA"] })).params,
    ).toEqual(["u1", "deptA"]);
    expect(dialect.sqlToQuery(goalScopeSql({ ...actor, scope: "all", delegatedIds: [] })).sql).toBe(
      "false",
    );
  });
  it("returns home goals with their scoped personnel and department metadata", async () => {
    m.select
      .mockReturnValueOnce(query([row]))
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(query([]));
    const result = await listGoals("2026-10", true);
    expect(result.users).toEqual([]);
    expect(result.items[0]?.actual).toBe(null);
    expect(result.access.canManageTeam).toBe(true);
    expect(m.select).toHaveBeenCalledTimes(3);
  });
  it("rejects stale versions before update or revision insert", async () => {
    m.txSelect.mockReturnValueOnce(query([row]));
    await expect(
      mutateGoal({
        action: "progress",
        id: row.id,
        version: 2,
        actual: 0,
        as_of: "2026-10-15",
        evidence: "报表",
        reason: "核对",
      }),
    ).rejects.toMatchObject({ httpStatus: 409 });
    expect(m.update).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });
  it("writes measured zero and audit together with a new version", async () => {
    existingTeamQueries(row);
    const result = await mutateGoal({
      action: "progress",
      id: row.id,
      version: 1,
      actual: 0,
      as_of: "2026-10-15",
      evidence: "报表：真实零",
      reason: "核对",
    });
    expect(result).toMatchObject({ actual: 0, version: 2, as_of: "2026-10-15" });
    expect(m.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "progress",
        reason: "核对",
        before: expect.objectContaining({ actual: null }),
        after: expect.objectContaining({ actual: 0 }),
      }),
    );
  });
  it("fill permission cannot publish or alter a published target", async () => {
    m.identity.mockResolvedValue({ kind: "ok", dingtalkUserId: "u1", isEmergency: false });
    await expect(
      mutateGoal({ action: "publish", id: row.id, version: 1, reason: "发布" }),
    ).rejects.toMatchObject({ httpStatus: 403 });
    m.select.mockReturnValue(query([{ id: "u1", name: "员工", depts: [] }]));
    m.txSelect.mockReturnValueOnce(query([row]));
    const {
      id: _i,
      actual: _a,
      as_of: _as,
      evidence: _e,
      status: _s,
      version: _v,
      created_by: _c,
      updated_at: _u,
      ...definition
    } = row;
    await expect(
      mutateGoal({
        action: "edit",
        id: row.id,
        version: 1,
        definition: { ...definition, target: 400000 },
        reason: "调整",
      }),
    ).rejects.toMatchObject({ httpStatus: 403 });
    expect(m.update).not.toHaveBeenCalled();
  });
  it("keeps actual when only target changes but invalidates actual when metric changes", async () => {
    const filled = { ...row, actual: 100, as_of: "2026-10-15", evidence: "报表" };
    const {
      id: _i,
      actual: _a,
      as_of: _as,
      evidence: _e,
      status: _s,
      version: _v,
      created_by: _c,
      updated_at: _u,
      ...definition
    } = row;
    m.select.mockReturnValue(query([{ id: "u1", depts: [] }]));
    existingTeamQueries(filled);
    expect(
      await mutateGoal({
        action: "edit",
        id: row.id,
        version: 1,
        definition: { ...definition, target: 400000 },
        reason: "调整目标",
      }),
    ).toMatchObject({ actual: 100 });
    existingTeamQueries(filled);
    expect(
      await mutateGoal({
        action: "edit",
        id: row.id,
        version: 1,
        definition: { ...definition, metric: "视频流水" },
        reason: "调整口径",
      }),
    ).toMatchObject({ actual: null, as_of: null, evidence: "" });
  });
  it("allows adding a team account after personal goals were split", async () => {
    const binding = {
      source: "douyin" as const,
      product: "ddz",
      field: "controller_total_amount",
      selection: "accounts" as const,
      account_ids: ["account-a"],
      direction: "gte" as const,
      qualification: null,
    };
    const parent = {
      ...row,
      project: "斗地主",
      line: "线下",
      metric: "小手柄流水",
      binding,
    };
    const child = {
      ...parent,
      id: "00000000-0000-4000-8000-000000000002",
      owner_ids: ["operator"],
      owner_labels: [],
      target: 100000,
      team_parent_id: parent.id,
      binding: { ...binding, selection: "operators" as const, account_ids: ["account-a"] },
    };
    m.sourceOptions.mockResolvedValue({
      users: [],
      accounts: [
        { id: "account-a", name: "账号A", operator_ids: ["operator"] },
        { id: "account-b", name: "账号B", operator_ids: ["operator-2"] },
      ],
    });
    m.execute.mockResolvedValue([
      { id: "account-a", name: "账号A", operator_ids: ["operator"] },
      { id: "account-b", name: "账号B", operator_ids: ["operator-2"] },
    ]);
    existingTeamQueries(parent);
    m.txSelect.mockReset();
    existingTeamQueries(parent);
    // Keep the fourth query as the linked personal goal while the first three
    // queries represent the row lock and team grouping lookup.
    m.txSelect
      .mockReset()
      .mockReturnValueOnce(query([parent]))
      .mockReturnValueOnce(query([parent]))
      .mockReturnValueOnce(query([parent]))
      .mockReturnValueOnce(query([child]))
      .mockReturnValueOnce(query([]));
    const {
      id: _id,
      actual: _actual,
      as_of: _asOf,
      evidence: _evidence,
      status: _status,
      version: _version,
      created_by: _createdBy,
      updated_at: _updatedAt,
      ...definition
    } = parent;
    const result = await mutateGoal({
      action: "edit",
      id: parent.id,
      version: parent.version,
      definition: {
        ...definition,
        binding: { ...binding, account_ids: ["account-a", "account-b"] },
      },
      reason: "补充漏选账号",
    });
    expect(result.binding?.account_ids).toEqual(["account-a", "account-b"]);
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ id: parent.id }));
    expect(m.update).not.toHaveBeenCalledWith(expect.objectContaining({ id: child.id }));
  });
  it("rejects allocations above quarter total without writing", async () => {
    const parent = {
      ...row,
      id: "00000000-0000-4000-8000-000000000002",
      period: "2026-Q4",
      target: 100,
    };
    const monthly = { ...row, parent_id: parent.id, target: 90 };
    existingTeamQueries(monthly);
    m.txSelect
      .mockReturnValueOnce(query([parent]))
      .mockReturnValueOnce(query([{ ...monthly, id: "other", period: "2026-11", target: 20 }]));
    await expect(
      mutateGoal({
        action: "progress",
        id: row.id,
        version: 1,
        actual: 1,
        as_of: "2026-10-15",
        evidence: "报表",
        reason: "填报",
      }),
    ).rejects.toThrow("超过");
    expect(m.update).not.toHaveBeenCalled();
  });
  it("synchronizes quarter definition changes to linked months with their own audit records", async () => {
    const parent = { ...row, period: "2026-Q4", target: 300, actual: 10 };
    const child = {
      ...row,
      id: "00000000-0000-4000-8000-000000000002",
      parent_id: parent.id,
      target: 100,
      actual: 5,
    };
    const {
      id: _id,
      actual: _a,
      as_of: _as,
      evidence: _e,
      status: _s,
      version: _v,
      created_by: _c,
      updated_at: _u,
      ...definition
    } = parent;
    m.select.mockReturnValue(query([{ id: "u1", depts: [] }]));
    existingTeamQueries(parent);
    m.txSelect
      .mockReturnValueOnce(query([child]))
      .mockReturnValueOnce(query([child]))
      .mockReturnValueOnce(query([child]))
      .mockReturnValueOnce(query([]));
    const revised = await mutateGoal({
      action: "edit",
      id: parent.id,
      version: 1,
      definition: { ...definition, definition: "确认新的统一口径" },
      reason: "核对季度与月度口径",
    });
    expect(revised.actual).toBe(null);
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: child.id,
        definition: "确认新的统一口径",
        actual: null,
        target: 100,
        version: 2,
      }),
    );
    expect(m.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        goal_id: child.id,
        action: "cascade",
        before: expect.objectContaining({ actual: 5 }),
        after: expect.objectContaining({ actual: null }),
      }),
    );
  });
  it("cannot lower a quarter target below already allocated months", async () => {
    const parent = { ...row, period: "2026-Q4", target: 300 };
    const child = {
      ...row,
      id: "00000000-0000-4000-8000-000000000002",
      parent_id: parent.id,
      target: 100,
    };
    const {
      id: _id,
      actual: _a,
      as_of: _as,
      evidence: _e,
      status: _s,
      version: _v,
      created_by: _c,
      updated_at: _u,
      ...definition
    } = parent;
    m.select.mockReturnValue(query([{ id: "u1", depts: [] }]));
    existingTeamQueries(parent);
    m.txSelect.mockReturnValueOnce(query([child]));
    await expect(
      mutateGoal({
        action: "edit",
        id: parent.id,
        version: 1,
        definition: { ...definition, target: 90 },
        reason: "调整季度目标",
      }),
    ).rejects.toThrow("超过");
    expect(m.update).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });
});
