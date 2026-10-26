import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const calls = vi.hoisted(() => ({
  mutate: vi.fn(),
  save: vi.fn(),
  group: vi.fn(),
  preview: vi.fn(),
  publishTeam: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "http://qjhypro.cn:8443" } }));
vi.mock("@/modules/goals/server", () => ({
  goalHistory: vi.fn(),
  listGoals: vi.fn(),
  sourceOptions: vi.fn(),
  mutateGoal: calls.mutate,
  saveGoalMetrics: calls.save,
  mutateGoalGroup: calls.group,
  previewGoal: calls.preview,
  publishTeamGoals: calls.publishTeam,
}));
import { POST } from "@/app/api/goals/route";

function request(origin: string | null, body: unknown = { action: "create" }, extra = {}) {
  return new Request("http://0.0.0.0:3000/api/goals", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(origin === null ? {} : { origin }),
      ...extra,
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("TRUSTED_ORIGINS", "");
  calls.mutate.mockResolvedValue({ id: "fixture" });
});
afterEach(() => vi.unstubAllEnvs());

describe("goals writes behind the NAS reverse proxy", () => {
  it.each(["previous", "comparison"])(
    "routes %s previews without performing goal writes",
    async (mode) => {
      calls.preview.mockResolvedValue({ actual: 10 });
      const response = await POST(
        request("http://localhost:3000", { action: "preview", definition: {}, mode }),
      );
      expect(response.status).toBe(200);
      expect(calls.preview).toHaveBeenCalledWith({}, mode);
      expect(calls.mutate).not.toHaveBeenCalled();
    },
  );
  it.each(["http://qjhypro.cn:8443", "http://172.16.39.61:3000", "http://localhost:3000"])(
    "accepts trusted browser origin %s despite the internal container URL",
    async (origin) => {
      const response = await POST(request(origin));
      expect(response.status).toBe(200);
      expect(calls.mutate).toHaveBeenCalledWith({ action: "create" });
    },
  );

  it("accepts additional explicitly configured origins", async () => {
    vi.stubEnv("TRUSTED_ORIGINS", " https://ops.example.test, ,https://internal.example.test ");
    expect((await POST(request("https://ops.example.test"))).status).toBe(200);
    expect((await POST(request("https://internal.example.test"))).status).toBe(200);
  });

  it.each([
    null,
    "null",
    "https://untrusted.invalid",
    "http://qjhypro.cn.attacker.test:8443",
    "http://qjhypro.cn:8444",
    "http://qjhypro.cn:8443/path",
    "http://0.0.0.0:3000",
  ])("rejects untrusted or missing origin %s before any goal operation", async (origin) => {
    const response = await POST(request(origin));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "请求来源不合法" });
    for (const operation of Object.values(calls)) expect(operation).not.toHaveBeenCalled();
  });

  it("does not trust forged forwarding headers or malformed origin configuration", async () => {
    vi.stubEnv("TRUSTED_ORIGINS", "invalid,*,null");
    const response = await POST(
      request("https://untrusted.invalid", undefined, {
        host: "untrusted.invalid",
        "x-forwarded-host": "untrusted.invalid",
        "x-forwarded-proto": "https",
      }),
    );
    expect(response.status).toBe(403);
    expect(calls.mutate).not.toHaveBeenCalled();
  });

  it("still requires authentication and operation permissions for trusted origins", async () => {
    calls.mutate.mockRejectedValueOnce(new AppError("UNAUTH", "请先登录有效账号", 401));
    expect((await POST(request("http://qjhypro.cn:8443"))).status).toBe(401);
    calls.mutate.mockRejectedValueOnce(new AppError("FORBIDDEN", "无权操作", 403));
    expect((await POST(request("http://qjhypro.cn:8443"))).status).toBe(403);
  });

  it.each([
    ["save-metrics", "save"],
    ["edit-group", "group"],
    ["close-group", "group"],
    ["preview", "preview"],
    ["publish-team", "publishTeam"],
  ] as const)("allows %s through the same source check", async (action, operation) => {
    calls[operation].mockResolvedValue({ id: "fixture" });
    const body = action === "preview" ? { action, definition: {} } : { action };
    expect((await POST(request("http://qjhypro.cn:8443", body))).status).toBe(200);
    expect(calls[operation]).toHaveBeenCalledOnce();
  });

  it("rejects untrusted bulk publication before any write", async () => {
    expect(
      (await POST(request("https://untrusted.invalid", { action: "publish-team" }))).status,
    ).toBe(403);
    expect(calls.publishTeam).not.toHaveBeenCalled();
  });
});
