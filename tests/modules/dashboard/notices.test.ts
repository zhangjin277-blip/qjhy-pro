import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  permission: vi.fn(),
  select: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/lib/auth/page-auth", () => ({ getCurrentDingtalkUser: mocks.identity }));
vi.mock("@/modules/permissions/server", () => ({ resolvePermission: mocks.permission }));
vi.mock("@/db/client", () => ({ db: { select: mocks.select } }));
vi.mock("@/modules/project-shared-state/server", () => ({
  createProjectSharedState: mocks.create,
  getProjectSharedState: mocks.get,
  updateProjectSharedState: mocks.update,
}));
import {
  deleteWorkbenchNotice,
  getWorkbenchNotices,
  markWorkbenchNoticesRead,
  publishWorkbenchNotice,
} from "@/modules/dashboard/notices";

const id = "1a13986c-f277-4de0-8815-309c886b2a17";
const notice = {
  id,
  title: "通知",
  body: "正文",
  category: "通知",
  pinned: false,
  publisher: "管理员",
  publishedAt: "2026-10-14T09:00:00.000Z",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.identity.mockResolvedValue({ kind: "ok", dingtalkUserId: "alice", isEmergency: false });
  mocks.permission.mockResolvedValue({ scope: "all", points: new Set() });
  mocks.get.mockResolvedValue({ payload: notice, revision: 3 });
  mocks.create.mockResolvedValue({});
  mocks.update.mockResolvedValue({});
});

describe("notice deletion", () => {
  it("rejects ordinary and unauthenticated callers before reading or changing a notice", async () => {
    await expect(deleteWorkbenchNotice(id)).rejects.toMatchObject({ httpStatus: 403 });
    mocks.identity.mockResolvedValue({ kind: "unauth" });
    await expect(deleteWorkbenchNotice(id)).rejects.toMatchObject({ httpStatus: 403 });
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("validates IDs and reports missing notices without writing", async () => {
    mocks.identity.mockResolvedValue({ kind: "ok", dingtalkUserId: "admin", isEmergency: true });
    await expect(deleteWorkbenchNotice("arbitrary_key")).rejects.toMatchObject({ httpStatus: 400 });
    expect(mocks.get).not.toHaveBeenCalled();
    mocks.get.mockResolvedValue(null);
    await expect(deleteWorkbenchNotice(id)).rejects.toMatchObject({ httpStatus: 404 });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("uses the stored revision and server identity while preserving notice content", async () => {
    mocks.permission.mockResolvedValue({ scope: "all", points: new Set(["manage_roles"]) });
    await deleteWorkbenchNotice(id);
    expect(mocks.update).toHaveBeenCalledWith(
      "workbench",
      `notice_${id}`,
      expect.objectContaining({ ...notice, deletedAt: expect.any(String), deletedBy: "alice" }),
      3,
      "alice",
    );
  });
  it("reports concurrent changes and treats repeated deletion as already complete", async () => {
    mocks.identity.mockResolvedValue({ kind: "ok", dingtalkUserId: "admin", isEmergency: true });
    mocks.update.mockResolvedValue(null);
    await expect(deleteWorkbenchNotice(id)).rejects.toMatchObject({ httpStatus: 409 });
    mocks.update.mockClear();
    mocks.get.mockResolvedValue({
      payload: { ...notice, deletedAt: "2026-10-15T06:00:00.000Z" },
      revision: 4,
    });
    await deleteWorkbenchNotice(id);
    await markWorkbenchNoticesRead([id]);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("excludes deleted notices from the list and unread items", async () => {
    mocks.select
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [
                { payload: notice },
                {
                  payload: {
                    ...notice,
                    id: "2a13986c-f277-4de0-8815-309c886b2a17",
                    deletedAt: "2026-10-15T06:00:00.000Z",
                  },
                },
              ],
            }),
          }),
        }),
      })
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) });
    const result = await getWorkbenchNotices();
    expect(result.items.map((item) => item.id)).toEqual([id]);
  });
});

describe("persistent notices", () => {
  it("forbids ordinary employees from publishing before any write", async () => {
    await expect(publishWorkbenchNotice(notice)).rejects.toMatchObject({ httpStatus: 403 });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("rejects disabled/invalid identities before any read or write", async () => {
    mocks.identity.mockResolvedValue({ kind: "unauth" });
    await expect(markWorkbenchNoticesRead([id])).rejects.toMatchObject({ httpStatus: 403 });
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("validates publisher input before inserting", async () => {
    mocks.permission.mockResolvedValue({ scope: "all", points: new Set(["manage_roles"]) });
    await expect(publishWorkbenchNotice({ ...notice, title: " " })).rejects.toMatchObject({
      httpStatus: 400,
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("persists an authorized publication with server-generated identity and time", async () => {
    mocks.permission.mockResolvedValue({ scope: "all", points: new Set(["manage_roles"]) });
    mocks.select.mockReturnValue({
      from: () => ({ where: () => ({ limit: async () => [{ name: "发布人" }] }) }),
    });
    await publishWorkbenchNotice({ ...notice, publisher: "forged", publishedAt: "forged" });
    expect(mocks.create).toHaveBeenCalledWith(
      "workbench",
      expect.stringMatching(/^notice_/),
      expect.objectContaining({
        title: "通知",
        publisher: "发布人",
        publishedAt: expect.stringMatching(/^\d{4}-/),
      }),
      "alice",
    );
    expect(mocks.create.mock.calls[0]?.[2].id).not.toBe(id);
  });
  it("writes the current user's receipt and deduplicates repeated IDs", async () => {
    await markWorkbenchNoticesRead([id, id]);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith(
      "workbench",
      `read_${createHash("sha256").update("alice").digest("hex")}_${id}`,
      expect.objectContaining({ readAt: expect.any(String) }),
      "alice",
    );
  });
  it("never creates receipts for missing notices", async () => {
    mocks.get.mockResolvedValue(null);
    await markWorkbenchNoticesRead([id]);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("validates all IDs before processing a batch", async () => {
    await expect(markWorkbenchNoticesRead([id, "arbitrary_key"])).rejects.toMatchObject({
      httpStatus: 400,
    });
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
