import { describe, expect, it } from "vitest";

import {
  countBusinessReview,
  onboardingStatus,
  recommendRecruitmentGrade,
} from "@/modules/business-recruitment";

describe("商务招募评级与入会状态", () => {
  it.each([
    [0, "C"],
    [1, "C"],
    [2, "B"],
    [3, "A"],
    [5, "A"],
  ] as const)("%i 项符合时建议 %s 类", (count, grade) => {
    expect(recommendRecruitmentGrade(count)).toBe(grade);
  });

  it("按五个布尔维度计算商务初评符合项数", () => {
    expect(
      countBusinessReview({
        appearancePass: true,
        voicePass: false,
        expressionPass: true,
        internetSensePass: true,
        resiliencePass: false,
      }),
    ).toBe(3);
  });

  it("签约与开播信息映射为流程状态", () => {
    expect(onboardingStatus({ signingStatus: "pending" })).toBe("signing");
    expect(onboardingStatus({ signingStatus: "signed" })).toBe("signed");
    expect(onboardingStatus({ signingStatus: "signed", firstLiveDate: "2026-08-18" })).toBe("live");
    expect(onboardingStatus({ signingStatus: "pending", firstLiveDate: "2026-08-18" })).toBe(
      "live",
    );
    expect(onboardingStatus({ signingStatus: "declined", firstLiveDate: "2026-08-18" })).toBe(
      "live",
    );
    expect(onboardingStatus({ signingStatus: "declined" })).toBe("rejected");
  });
});
