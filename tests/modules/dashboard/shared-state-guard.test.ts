import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ get: vi.fn(), create: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/auth/page-auth", () => ({
  requireUser: vi.fn().mockResolvedValue({ userId: "employee" }),
  getCurrentDingtalkUser: vi.fn(),
}));
vi.mock("@/modules/project-shared-state/server", () => ({
  getProjectSharedState: mocks.get,
  createProjectSharedState: mocks.create,
  updateProjectSharedState: mocks.update,
}));
vi.mock("@/modules/permissions/server", () => ({ resolvePermission: vi.fn() }));
import { GET, PUT } from "@/app/api/projects/[projectKey]/shared-state/[stateKey]/route";

beforeEach(() => vi.clearAllMocks());
it("blocks generic GET and PUT from bypassing notice/read-receipt authorization", async () => {
  for (const stateKey of ["notice_any", "read_other_user"]) {
    const context = { params: Promise.resolve({ projectKey: "workbench", stateKey }) };
    const url = `http://localhost/api/projects/workbench/shared-state/${stateKey}`;
    expect((await GET(new NextRequest(url), context)).status).toBe(403);
    expect(
      (
        await PUT(
          new NextRequest(url, {
            method: "PUT",
            body: JSON.stringify({ revision: null, payload: {} }),
          }),
          context,
        )
      ).status,
    ).toBe(403);
  }
  expect(mocks.get).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});
