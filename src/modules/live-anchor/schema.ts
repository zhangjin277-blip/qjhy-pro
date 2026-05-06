import { z } from "zod";

export const BusinessLine = z.enum(["捕鱼", "斗地主", "麻将"]);
export type BusinessLine = z.infer<typeof BusinessLine>;

export const EmploymentType = z.enum(["正式", "合作", "试播"]);
export type EmploymentType = z.infer<typeof EmploymentType>;

export const WorkStatus = z.enum(["active", "rest", "leave"]);
export type WorkStatus = z.infer<typeof WorkStatus>;

export const UpsertAnchorInput = z.object({
  dingtalk_user_id: z.string().min(1),
  business_line: BusinessLine,
  employment_type: EmploymentType,
  work_status: WorkStatus.default("active"),
  trial_start_date: z.string().date().optional().nullable(),
  contract_date: z.string().date().optional().nullable(),
  leave_date: z.string().date().optional().nullable(),
  external_name: z.string().optional().nullable(),
});
export type UpsertAnchorInput = z.infer<typeof UpsertAnchorInput>;

export const ListAnchorsInput = z.object({
  business_line: BusinessLine.optional(),
  work_status: WorkStatus.optional(),
});
