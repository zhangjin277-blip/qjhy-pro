import { beforeEach, describe, expect, it, vi } from "vitest";
import { SelfReviewInput } from "@/modules/people-performance/schema";
import { AppError } from "@/lib/errors";

const handlers = vi.hoisted(() => ({
  openProbationGoalSetting: vi.fn(),
  submitPerformanceSelfReview: vi.fn(),
  submitPerformanceManagerReview: vi.fn(),
  submitPerformanceSkipManagerReview: vi.fn(),
  calibratePerformance: vi.fn(),
  savePeopleProfile: vi.fn(),
}));
vi.mock("@/modules/people-performance", () => handlers);
import { POST } from "@/app/api/people-performance/assessment/route";

const input = {
  cycleId: "cycle",
  summary: "按要求完成",
  goals: [{ id: "goal", completion: "已完成", score: 35 }],
};
function request(operation: string, data: unknown = input) {
  return new Request("http://localhost/api/people-performance/assessment", {
    method: "POST",
    body: JSON.stringify({ operation, input: data }),
  });
}

describe("assessment API", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns a Chinese message when the self-review summary is empty", async () => {
    handlers.submitPerformanceSelfReview.mockImplementation((data) => SelfReviewInput.parse(data));
    const response = await POST(request("self_review", { ...input, summary: " " }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toBe("请填写自评总结");
  });

  it("passes a complete self-review to the existing authorization and submission action", async () => {
    handlers.submitPerformanceSelfReview.mockResolvedValue({ ok: true });
    const response = await POST(request("self_review"));
    expect(response.status).toBe(200);
    expect(handlers.submitPerformanceSelfReview).toHaveBeenCalledWith(input);
  });

  it("preserves permission errors for early goal opening", async () => {
    handlers.openProbationGoalSetting.mockRejectedValue(
      new AppError("AUTH_FORBIDDEN", "无操作权限", 403),
    );
    const response = await POST(request("open_goals", { cycleId: "cycle" }));
    expect(response.status).toBe(403);
    expect((await response.json()).error.message).toBe("无操作权限");
  });

  it("sends three-month profile saves through the authorized action", async () => {
    handlers.savePeopleProfile.mockResolvedValue({ ok: true });
    const profile = { userId: "employee", probationMonths: 3 };
    const response = await POST(request("save_profile", profile));
    expect(response.status).toBe(200);
    expect(handlers.savePeopleProfile).toHaveBeenCalledWith(profile);
  });

  it("rejects unsupported operations in Chinese", async () => {
    const response = await POST(request("unknown"));
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain("操作类型");
  });
});
