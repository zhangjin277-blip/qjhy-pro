import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const where = vi.fn().mockResolvedValue([]);
  const values = vi.fn(() => ({
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  }));
  return {
    points: [] as string[],
    getSession: vi.fn(),
    identity: vi.fn(),
    resolvePermission: vi.fn(),
    db: {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where })) })),
      insert: vi.fn(() => ({ values })),
      delete: vi.fn(() => ({ where })),
    },
    audit: vi.fn(),
    generateInvite: vi.fn(),
    revokeInvite: vi.fn(),
    listInvites: vi.fn(),
    listUses: vi.fn(),
  };
});

vi.mock("@/db/client", () => ({ db: mocks.db }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/lib/auth/dingtalk-identity", () => ({
  resolveDingtalkIdentityByAuthUserId: mocks.identity,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/modules/permissions/server", () => ({
  resolvePermission: mocks.resolvePermission,
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("@/modules/invite-codes/server", () => ({
  generateInviteCode: mocks.generateInvite,
  revokeInviteCode: mocks.revokeInvite,
  listInviteCodes: mocks.listInvites,
  listInviteCodeUses: mocks.listUses,
  normalizeCode: (code: string) => code,
  formatCodeForDisplay: (code: string) => `QJHY-${code}`,
}));

import {
  assignUserPosition,
  removeDeptLeader,
  setDeptLeader,
  upsertOverride,
  upsertOverrideBatch,
  upsertRoleDefault,
} from "@/modules/permissions/actions";
import {
  generateInviteCodeAction,
  listInviteCodesAction,
  listInviteCodeUsesAction,
  revokeInviteCodeAction,
} from "@/modules/invite-codes/actions";

const reason = "authorization regression";
const mutations = [
  {
    name: "single override",
    point: "manage_overrides",
    run: () =>
      upsertOverride({
        user_id: "caller",
        module: "permissions",
        scope: "all",
        points: ["manage_overrides", "manage_roles"],
        reason,
      }),
  },
  {
    name: "batch overrides",
    point: "manage_overrides",
    run: () =>
      upsertOverrideBatch({
        user_id: "caller",
        entries: [{ module: "permissions", scope: "all", points: ["manage_overrides"] }],
        reason,
      }),
  },
  {
    name: "position assignment",
    point: "manage_roles",
    run: () => assignUserPosition({ user_id: "caller", position: "admin", reason }),
  },
  {
    name: "role defaults",
    point: "manage_roles",
    run: () =>
      upsertRoleDefault({
        position: "admin",
        module: "permissions",
        scope: "all",
        points: ["manage_overrides"],
      }),
  },
  {
    name: "add department leader",
    point: "manage_dept_leaders",
    run: () => setDeptLeader({ user_id: "caller", dept_id: "department" }),
  },
  {
    name: "remove department leader",
    point: "manage_dept_leaders",
    run: () => removeDeptLeader({ user_id: "caller", dept_id: "department" }),
  },
];
const managementPoints = [
  "invite_codes",
  "manage_overrides",
  "manage_roles",
  "manage_dept_leaders",
];
const inviteInput = {
  perms: [{ module: "permissions", scope: "all", points: ["manage_overrides"] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.points = [];
  mocks.getSession.mockResolvedValue({ user: { id: "auth-caller", email: "caller@example.com" } });
  mocks.identity.mockResolvedValue({ kind: "ok", dingtalkUserId: "caller" });
  mocks.resolvePermission.mockImplementation(async () => ({
    scope: "all",
    points: new Set(mocks.points),
    sources: [],
  }));
  mocks.generateInvite.mockResolvedValue({ code: "ABCDEF" });
  mocks.revokeInvite.mockResolvedValue({ ok: true });
  mocks.listInvites.mockResolvedValue([]);
  mocks.listUses.mockResolvedValue([]);
});

describe("permission mutation authorization", () => {
  for (const mutation of mutations) {
    it.each(managementPoints.filter((point) => point !== mutation.point))(
      `${mutation.name} rejects unrelated permission %s before database access`,
      async (point) => {
        mocks.points = [point];
        await expect(mutation.run()).rejects.toMatchObject({ code: "AUTH_FORBIDDEN" });
        expect(mocks.db.select).not.toHaveBeenCalled();
        expect(mocks.db.insert).not.toHaveBeenCalled();
        expect(mocks.db.delete).not.toHaveBeenCalled();
        expect(mocks.audit).not.toHaveBeenCalled();
      },
    );

    it(`${mutation.name} allows its own permission`, async () => {
      mocks.points = [mutation.point];
      await expect(mutation.run()).resolves.toMatchObject({ ok: true });
      expect(mocks.audit).toHaveBeenCalledOnce();
    });
  }

  it("rejects an unauthenticated caller", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(mutations[0]?.run()).rejects.toMatchObject({ code: "AUTH_NOT_LOGGED_IN" });
    expect(mocks.db.select).not.toHaveBeenCalled();
  });

  it("preserves emergency administrator access", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "emergency", email: "emergency@qjhy.local" },
    });
    for (const mutation of mutations)
      await expect(mutation.run()).resolves.toMatchObject({ ok: true });
    expect(mocks.resolvePermission).not.toHaveBeenCalled();
  });
});

describe("invite permission authorization", () => {
  it.each([[], ["invite_codes"], ["manage_overrides"], ["manage_roles"]])(
    "rejects permission-granting invitations without both permissions: %j",
    async (...points) => {
      mocks.points = points;
      await expect(generateInviteCodeAction(inviteInput)).rejects.toMatchObject({
        code: "AUTH_FORBIDDEN",
      });
      expect(mocks.generateInvite).not.toHaveBeenCalled();
    },
  );

  it("allows invitation creation with both permissions", async () => {
    mocks.points = ["invite_codes", "manage_overrides"];
    await expect(generateInviteCodeAction(inviteInput)).resolves.toMatchObject({ ok: true });
    expect(mocks.generateInvite).toHaveBeenCalledOnce();
  });

  it("allows invite-only users to list and revoke invitations", async () => {
    mocks.points = ["invite_codes"];
    await expect(listInviteCodesAction()).resolves.toEqual([]);
    await expect(listInviteCodeUsesAction("ABCDEF")).resolves.toEqual([]);
    await expect(revokeInviteCodeAction({ code: "ABCDEF" })).resolves.toEqual({ ok: true });
  });

  it("rejects invite operations for other administrators", async () => {
    mocks.points = ["manage_roles"];
    await expect(listInviteCodesAction()).rejects.toMatchObject({ code: "AUTH_FORBIDDEN" });
    await expect(listInviteCodeUsesAction("ABCDEF")).rejects.toMatchObject({
      code: "AUTH_FORBIDDEN",
    });
    await expect(revokeInviteCodeAction({ code: "ABCDEF" })).rejects.toMatchObject({
      code: "AUTH_FORBIDDEN",
    });
    expect(mocks.listInvites).not.toHaveBeenCalled();
    expect(mocks.listUses).not.toHaveBeenCalled();
    expect(mocks.revokeInvite).not.toHaveBeenCalled();
  });
});
