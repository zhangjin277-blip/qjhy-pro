import { describe, expect, it } from "vitest";

import {
  SaveRecruitmentBaseInput,
  SaveRecruitmentBusinessReviewInput,
  SaveRecruitmentOnboardingInput,
} from "@/modules/business-recruitment";

describe("商务招募输入校验", () => {
  it("基础登记要求平台、账号和联系方式", () => {
    const result = SaveRecruitmentBaseInput.safeParse({
      platform: "douyin",
      gameProduct: "和平精英",
      anchorName: "林小溪",
      gender: "female",
      phone: "13800007264",
      accountNickname: "溪溪不熬夜",
      accountId: "56281940",
      followerCount: 12600,
      advance: true,
    });
    expect(result.success).toBe(true);
  });

  it("所有签约状态都允许填写首次开播日期", () => {
    const result = SaveRecruitmentOnboardingInput.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      signingStatus: "pending",
      firstLiveDate: "2026-08-18",
    });
    expect(result.success).toBe(true);
  });

  it("五维说明为选填且不影响勾选字段校验", () => {
    const result = SaveRecruitmentBusinessReviewInput.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      equipmentStatus: "ready",
      willingness: "strong",
      appearancePass: true,
      appearanceNote: "形象有辨识度",
      voicePass: false,
      voiceNote: null,
      expressionPass: true,
      internetSensePass: false,
      resiliencePass: true,
      resilienceNote: "情绪稳定",
      advance: false,
    });
    expect(result.success).toBe(true);
  });
});
