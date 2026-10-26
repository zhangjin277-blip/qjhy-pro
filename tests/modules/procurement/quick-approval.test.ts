import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const m = vi.hoisted(() => ({
  identity: vi.fn(),
  permission: vi.fn(),
  transaction: vi.fn(),
  selectWhere: vi.fn(),
  updateWhere: vi.fn(),
  returning: vi.fn(),
  insert: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("@/lib/auth/page-auth", () => ({ getCurrentDingtalkUser: m.identity }));
vi.mock("@/modules/permissions/server", () => ({
  resolvePermission: m.permission,
  hasPoint: (p: { points: Set<string> }, key: string) => p.points.has(key),
  scopeAtLeast: (scope: string) => ["team", "all"].includes(scope),
}));
vi.mock("@/modules/procurement/notify", () => ({
  notifyProcurementNew: vi.fn(),
  notifyProcurementTransition: m.notify,
}));
vi.mock("@/modules/procurement/anchor-options", () => ({ resolveProcurementAnchor: vi.fn() }));
vi.mock("@/db/client", () => ({ db: { transaction: m.transaction } }));
import { transitionProcurement } from "@/modules/procurement/server";
beforeEach(() => {
  vi.resetAllMocks();
  m.identity.mockResolvedValue({ kind: "ok", dingtalkUserId: "approver", isEmergency: false });
  m.permission.mockResolvedValue({ scope: "self", points: new Set(["approve"]) });
  m.selectWhere.mockResolvedValue([{ id: 1, status: "pending_approval", item_name: "物品" }]);
  m.returning.mockResolvedValue([{ id: 1, status: "pending", item_name: "物品" }]);
  m.updateWhere.mockReturnValue({ returning: m.returning });
  m.transaction.mockImplementation(async (fn) =>
    fn({
      select: () => ({ from: () => ({ where: m.selectWhere }) }),
      update: () => ({ set: () => ({ where: m.updateWhere }) }),
      insert: () => ({ values: m.insert }),
    }),
  );
});
describe("workbench procurement decisions", () => {
  it("requires approval permission before any transaction", async () => {
    m.permission.mockResolvedValue({ scope: "all", points: new Set() });
    await expect(transitionProcurement(1, "approve")).rejects.toMatchObject({ httpStatus: 403 });
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it("requires a rejection reason", async () => {
    await expect(transitionProcurement(1, "reject", { remark: "  " })).rejects.toMatchObject({
      httpStatus: 400,
    });
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it("scopes self decisions and atomically checks the pending state before logging and notifying", async () => {
    await transitionProcurement(1, "approve");
    const dialect = new PgDialect();
    const visible = dialect.sqlToQuery(m.selectWhere.mock.calls[0]?.[0]);
    expect(visible.sql).toContain("submitter_user_id");
    expect(visible.params).toContain("approver");
    const guarded = dialect.sqlToQuery(m.updateWhere.mock.calls[0]?.[0]);
    expect(guarded.params).toContain("pending_approval");
    expect(m.insert).toHaveBeenCalledOnce();
    expect(m.notify).toHaveBeenCalledOnce();
  });
  it("does not mutate a completed request or notify again", async () => {
    m.selectWhere.mockResolvedValue([{ id: 1, status: "purchased" }]);
    await expect(transitionProcurement(1, "reject", { remark: "无需要" })).rejects.toMatchObject({
      httpStatus: 409,
    });
    expect(m.updateWhere).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
    expect(m.notify).not.toHaveBeenCalled();
  });
  it("rejects a concurrent decision that loses the conditional update", async () => {
    m.returning.mockResolvedValue([]);
    await expect(transitionProcurement(1, "approve")).rejects.toMatchObject({ httpStatus: 409 });
    expect(m.insert).not.toHaveBeenCalled();
    expect(m.notify).not.toHaveBeenCalled();
  });
  it("does not disclose or update an out-of-scope request", async () => {
    m.selectWhere.mockResolvedValue([]);
    await expect(transitionProcurement(99, "approve")).rejects.toMatchObject({ httpStatus: 404 });
    expect(m.updateWhere).not.toHaveBeenCalled();
    expect(m.notify).not.toHaveBeenCalled();
  });
});
