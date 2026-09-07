export type RecruitmentGrade = "A" | "B" | "C";
export type RecruitmentStatus =
  | "draft"
  | "business_review"
  | "operation_review"
  | "signing"
  | "signed"
  | "live"
  | "rejected"
  | "abnormal";

export function recommendRecruitmentGrade(passCount: number): RecruitmentGrade {
  if (passCount >= 3) return "A";
  if (passCount === 2) return "B";
  return "C";
}

export function countBusinessReview(input: {
  appearancePass: boolean;
  voicePass: boolean;
  expressionPass: boolean;
  internetSensePass: boolean;
  resiliencePass: boolean;
}): number {
  return [
    input.appearancePass,
    input.voicePass,
    input.expressionPass,
    input.internetSensePass,
    input.resiliencePass,
  ].filter(Boolean).length;
}

export function onboardingStatus(input: {
  signingStatus: "pending" | "signed" | "declined" | "abnormal";
  firstLiveDate?: string | null;
}): RecruitmentStatus {
  if (input.signingStatus === "abnormal") return "abnormal";
  if (input.firstLiveDate) return "live";
  if (input.signingStatus === "declined") return "rejected";
  if (input.signingStatus === "signed") return "signed";
  return "signing";
}
