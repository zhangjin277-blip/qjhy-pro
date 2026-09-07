import { z } from "zod";

export const RecruitmentStatusSchema = z.enum([
  "draft",
  "business_review",
  "operation_review",
  "signing",
  "signed",
  "live",
  "rejected",
  "abnormal",
]);
export const RecruitmentGradeSchema = z.enum(["A", "B", "C"]);
export const RecruitmentPlatformSchema = z.enum(["douyin", "kuaishou", "other"]);

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

export const EmptyRecruitmentInput = z.object({}).strict();
export const RecruitmentIdInput = z.object({ id: z.string().uuid() });

export const SaveRecruitmentBaseInput = z.object({
  id: z.string().uuid().optional(),
  platform: RecruitmentPlatformSchema,
  gameProduct: z.string().trim().min(1, "请选择游戏产品").max(100),
  anchorName: z.string().trim().min(1, "请填写主播姓名").max(50),
  gender: z.enum(["female", "male", "unspecified"]),
  phone: z.string().trim().min(6, "请填写有效联系电话").max(30),
  accountNickname: z.string().trim().min(1, "请填写账号昵称").max(100),
  accountId: z.string().trim().min(1, "请填写账号 ID").max(100),
  uid: optionalText(100),
  followerCount: z.number().int().nonnegative().max(1_000_000_000),
  accountSummary: optionalText(2000),
  advance: z.boolean(),
});

export const SaveRecruitmentBusinessReviewInput = z.object({
  id: z.string().uuid(),
  equipmentStatus: z.enum(["ready", "partial", "missing"]),
  willingness: z.enum(["strong", "medium", "weak"]),
  policy: optionalText(1000),
  appearancePass: z.boolean(),
  appearanceNote: optionalText(500),
  voicePass: z.boolean(),
  voiceNote: optionalText(500),
  expressionPass: z.boolean(),
  expressionNote: optionalText(500),
  internetSensePass: z.boolean(),
  internetSenseNote: optionalText(500),
  resiliencePass: z.boolean(),
  resilienceNote: optionalText(500),
  operatorUserId: z.string().min(1).optional().nullable(),
  advance: z.boolean(),
});

export const SaveRecruitmentOperationReviewInput = z.object({
  id: z.string().uuid(),
  operationReviewCount: z.number().int().min(0).max(5),
  finalGrade: RecruitmentGradeSchema,
  operatorUserId: z.string().min(1).optional().nullable(),
  operationFeedback: z.string().trim().min(1, "请填写运营反馈").max(3000),
  advance: z.boolean(),
});

export const SaveRecruitmentOnboardingInput = z.object({
  id: z.string().uuid(),
  joinDate: z.iso.date().optional().nullable(),
  firstLiveDate: z.iso.date().optional().nullable(),
  signingStatus: z.enum(["pending", "signed", "declined", "abnormal"]),
  abnormalNote: optionalText(2000),
});

export type SaveRecruitmentBaseInput = z.infer<typeof SaveRecruitmentBaseInput>;
export type SaveRecruitmentBusinessReviewInput = z.infer<typeof SaveRecruitmentBusinessReviewInput>;
export type SaveRecruitmentOperationReviewInput = z.infer<
  typeof SaveRecruitmentOperationReviewInput
>;
export type SaveRecruitmentOnboardingInput = z.infer<typeof SaveRecruitmentOnboardingInput>;
