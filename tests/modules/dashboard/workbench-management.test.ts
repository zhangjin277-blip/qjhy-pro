import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const m = vi.hoisted(() => ({
  identity: vi.fn(),
  access: vi.fn(),
  permission: vi.fn(),
  select: vi.fn(),
  dispatch: vi.fn(),
  scope: vi.fn(),
  aliases: vi.fn(),
}));
vi.mock("@/modules/aliases/server", () => ({ getDeptAliasMap: m.aliases }));
vi.mock("@/lib/auth/page-auth", () => ({ getCurrentDingtalkUser: m.identity }));
vi.mock("@/modules/permissions/server", () => ({ resolvePermission: m.permission }));
vi.mock("@/modules/attendance/server", () => ({
  attendanceActor: m.access,
  dispatchAttendanceRequest: m.dispatch,
}));
vi.mock("@/modules/editing-task/server", () => ({ buildEditingScopeWhere: m.scope }));
vi.mock("@/modules/people-performance", () => ({ dingtalkHireDate: () => null }));
vi.mock("@/db/client", () => ({ db: { select: m.select } }));
import {
  getPersonalCalendar,
  getManagementWorkbench,
} from "@/modules/dashboard/workbench-management";
beforeEach(() => {
  vi.resetAllMocks();
  m.identity.mockResolvedValue({ kind: "ok", dingtalkUserId: "me", isEmergency: false });
  m.access.mockResolvedValue({ user: { allowedUserIds: ["me"] } });
  m.permission.mockResolvedValue({ scope: "none", points: new Set() });
  m.aliases.mockResolvedValue(new Map());
});
const selectWhere = (rows: unknown[]) => ({ from: () => ({ where: async () => rows }) });
describe("personal calendar access", () => {
  it("rejects unauthenticated and invalid-month requests before reading employee data", async () => {
    m.identity.mockResolvedValue({ kind: "unauth" });
    await expect(getPersonalCalendar("2026-10")).rejects.toMatchObject({ httpStatus: 401 });
    m.identity.mockResolvedValue({ kind: "ok", dingtalkUserId: "me" });
    await expect(getPersonalCalendar("2026-13")).rejects.toMatchObject({ httpStatus: 400 });
    expect(m.select).not.toHaveBeenCalled();
  });
  it("explains unlinked emergency identities without inventing normal days", async () => {
    m.select.mockReturnValueOnce(selectWhere([]));
    expect(await getPersonalCalendar("2026-10")).toMatchObject({
      days: [],
      unavailable: expect.stringContaining("未关联"),
    });
    expect(m.dispatch).not.toHaveBeenCalled();
  });
  it("loads the current employee by ID even when another account has the same name", async () => {
    m.select.mockReturnValueOnce(selectWhere([{ id: "me", name: "同名" }]));
    m.dispatch.mockResolvedValue(
      Response.json({
        success: true,
        data: {
          records: [
            {
              work_date: "2026-10-01",
              dingtalk_userid: "me",
              on_duty_result: "Normal",
              off_duty_result: "Normal",
            },
          ],
          approvals: [],
          roster: [],
        },
      }),
    );
    const result = await getPersonalCalendar("2026-10");
    expect(result.unavailable).toBeNull();
    expect(result.days[0]?.status).toBe("normal");
    expect(m.select).toHaveBeenCalledOnce();
    const query = new URL(m.dispatch.mock.calls[0]?.[0].url).searchParams;
    expect(query.get("user_id")).toBe("me");
    expect(query.has("name")).toBe(false);
  });
  it("filters foreign employee records even when the legacy name query returns them", async () => {
    m.select.mockReturnValueOnce(selectWhere([{ id: "me", name: "本人" }]));
    m.dispatch.mockResolvedValue(
      Response.json({
        success: true,
        data: {
          records: [
            {
              work_date: "2026-10-01",
              dingtalk_userid: "other",
              on_duty_result: "Normal",
              off_duty_result: "Normal",
            },
          ],
          approvals: [],
          roster: [],
        },
      }),
    );
    const result = await getPersonalCalendar("2026-10");
    expect(result.days[0]?.status).toBe("none");
    expect(new URL(m.dispatch.mock.calls[0]?.[0].url).searchParams.get("user_id")).toBe("me");
  });
});
describe("management data authorization", () => {
  it("does not read personnel or editing data without their module permissions", async () => {
    const data = await getManagementWorkbench();
    expect(data.personnel.data).toBeNull();
    expect(data.personnel.hidden).toBe(true);
    expect(data.editors.data).toBeNull();
    expect(m.select).not.toHaveBeenCalled();
  });
  it.each(["self", "team", "all"])(
    "does not expose personnel via %s personnel scope without the independent card grant",
    async (scope) => {
      m.permission.mockImplementation((_id, module) =>
        Promise.resolve({
          scope: module === "people_performance" ? scope : module === "dashboard" ? "team" : "none",
          points: new Set(module === "people_performance" ? ["manage_profiles"] : []),
        }),
      );
      const data = await getManagementWorkbench();
      expect(data.personnel).toMatchObject({ data: null, hidden: true });
      expect(m.permission.mock.calls.some(([, module]) => module === "people_performance")).toBe(
        false,
      );
      expect(m.select).not.toHaveBeenCalled();
      expect(m.aliases).not.toHaveBeenCalled();
      expect(m.access).not.toHaveBeenCalled();
    },
  );
  it("requires the existing personnel access even with the card grant", async () => {
    m.permission.mockImplementation((_id, module) =>
      Promise.resolve({
        scope: "none",
        points: new Set(module === "dashboard" ? ["view_personnel"] : []),
      }),
    );
    expect((await getManagementWorkbench()).personnel).toMatchObject({ data: null, hidden: true });
    expect(m.select).not.toHaveBeenCalled();
  });
  it.each(["self", "all"])(
    "retains %s personnel data scope after granting the card",
    async (scope) => {
      m.permission.mockImplementation((_id, module) =>
        Promise.resolve({
          scope: module === "people_performance" ? scope : "none",
          points: new Set(module === "dashboard" ? ["view_personnel"] : []),
        }),
      );
      let condition: Parameters<PgDialect["sqlToQuery"]>[0] | undefined;
      m.select.mockReturnValueOnce({
        from: () => ({
          leftJoin: () => ({
            where: async (where: typeof condition) => {
              condition = where;
              return [
                {
                  id: "me",
                  name: "本人",
                  title: null,
                  deptIds: ["dept"],
                  active: true,
                  raw: {},
                  hireDate: null,
                  status: "regular",
                  firstSyncedAt: null,
                  lastInactiveAt: null,
                },
              ];
            },
          }),
        }),
      });
      m.select.mockReturnValueOnce({
        from: async () => [{ id: "dept", name: "部门", parentId: null }],
      });
      m.aliases.mockResolvedValue(new Map([["dept", { alias: "部门别名", note: null }]]));
      m.dispatch.mockImplementation(async () => Response.json({ success: true, data: [] }));
      const data = await getManagementWorkbench();
      expect(data.personnel.hidden).toBe(false);
      expect(data.personnel.data?.departments[0]).toMatchObject({ name: "部门别名", active: 1 });
      if (!condition) throw new Error("Expected personnel query");
      const query = new PgDialect().sqlToQuery(condition);
      expect(query.sql).toContain("is_external");
      if (scope === "self") {
        expect(query.sql).toContain("manager_user_id");
        expect(query.sql).toContain("skip_manager_user_id");
        expect(query.params.filter((v) => v === "me")).toHaveLength(3);
      } else expect(query.sql).not.toContain("manager_user_id");
    },
  );
  it("shows a retry error instead of hiding the card when permission loading fails", async () => {
    m.permission.mockImplementation((_id, module) => {
      if (module === "dashboard") return Promise.reject(new Error("Database unavailable"));
      return Promise.resolve({ scope: "none", points: new Set() });
    });
    expect((await getManagementWorkbench()).personnel).toMatchObject({
      data: null,
      hidden: false,
      error: "暂时无法加载，请刷新重试",
    });
    expect(m.select).not.toHaveBeenCalled();
  });
  it("keeps self editing access in the existing operator view", async () => {
    m.permission.mockImplementation((_id, module) =>
      Promise.resolve({
        scope: module === "editing_workflow" ? "self" : "none",
        points: new Set(),
      }),
    );
    const data = await getManagementWorkbench();
    expect(data.editors.data).toEqual({ management: false, rows: [] });
    expect(m.select).not.toHaveBeenCalled();
  });
  it("counts submissions by uploaded output date and retains editors with unfinished work", async () => {
    m.permission.mockImplementation((_id, module) =>
      Promise.resolve({ scope: module === "editing_workflow" ? "all" : "none", points: new Set() }),
    );
    let projection: Record<string, unknown> = {};
    m.select.mockImplementation((fields) => {
      projection = fields;
      return {
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              groupBy: () => ({
                orderBy: async () => [
                  { id: "editor", name: "甲", today: 0, month: 0, editing: 3, review: 1 },
                ],
              }),
            }),
          }),
        }),
      };
    });
    const data = await getManagementWorkbench();
    expect(data.editors.data?.rows[0]).toMatchObject({ month: 0, editing: 3, review: 1 });
    const q = new PgDialect().sqlToQuery(
      projection.month as Parameters<PgDialect["sqlToQuery"]>[0],
    );
    expect(q.sql).toContain("edited_uploaded_at");
    expect(q.sql).toContain("Asia/Shanghai");
    expect(q.sql).not.toContain("material_date");
  });
});
