import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();
const optionalDate = z.iso.date().optional().nullable();

export const SavePipelineApplicationInput = z.object({
  id: z.string().uuid().optional(),
  candidateName: z.string().trim().min(1, "请填写候选人姓名").max(50),
  phone: optionalText(30),
  project: optionalText(100),
  channel: z.string().trim().min(1).max(50),
  sourceAccount: optionalText(100),
  recruiterUserId: optionalText(100),
  recruiterNameSnapshot: optionalText(50),
  invitedDate: z.iso.date(),
  interviewDate: optionalDate,
  interviewTime: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .optional()
    .nullable(),
  attendanceStatus: z.enum(["pending", "attended", "no_show"]),
  initialResult: z.enum(["pending", "pass", "fail"]),
  finalResult: z.enum(["pending", "pass", "fail"]),
  offerStatus: z.enum(["pending", "sent", "declined"]),
  expectedJoinDate: optionalDate,
  actualJoinDate: optionalDate,
  trialResult: z.enum(["pending", "pass", "fail"]),
  trialDate: optionalDate,
  mentorUserId: optionalText(100),
  mentorNameSnapshot: optionalText(50),
  contractStatus: z.enum(["pending", "signed", "declined"]),
  leaveDate: optionalDate,
  leaveReason: optionalText(1000),
  notes: optionalText(3000),
});

export const SaveRecruitmentDemandInput = z.object({
  id: z.string().uuid().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/, "月份格式应为 YYYY-MM"),
  category: optionalText(50),
  project: z.string().trim().min(1, "请填写项目").max(100),
  targetCount: z.number().int().min(0).max(10000),
  notes: optionalText(1000),
});

export const PipelineApplicationIdInput = z.object({ id: z.string().uuid() });
export const EmptyRecruitmentCenterInput = z.object({}).strict();

export type SavePipelineApplicationInput = z.infer<typeof SavePipelineApplicationInput>;
export type SaveRecruitmentDemandInput = z.infer<typeof SaveRecruitmentDemandInput>;
