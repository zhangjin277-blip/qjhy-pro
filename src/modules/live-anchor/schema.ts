import { z } from "zod";

// business_line 拆到产品级（捕鱼分 3 个产品）。"捕鱼" 是历史值，存量迁移时用，新建禁用。
export const BUSINESS_LINE_VALUES = [
  "捕鱼大作战",
  "途游休闲捕鱼",
  "电玩捕鱼",
  "斗地主",
  "麻将",
  "三国:冰河时代",
] as const;
export const BusinessLine = z.enum(BUSINESS_LINE_VALUES);
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

// 默认排班 binding
export const TimeSlot = z.tuple([
  z.string().regex(/^\d{2}:\d{2}$/, "时段格式必须为 HH:MM"),
  z.string().regex(/^\d{2}:\d{2}$/),
]);

export const UpsertBindingInput = z.object({
  id: z.string().optional(),
  account_id: z.string().min(1),
  dingtalk_user_id: z.string().min(1),
  time_slots: z.array(TimeSlot).min(1, "至少一个时段"),
  rest_days: z.array(z.number().int().min(1).max(7)).default([]),
  remark: z.string().optional().nullable(),
  effective_from: z.string().date().optional(),
  effective_to: z.string().date().optional().nullable(),
});
export type UpsertBindingInput = z.infer<typeof UpsertBindingInput>;

export const DeleteBindingInput = z.object({
  id: z.string().min(1),
});

export const ListBindingsInput = z.object({
  account_id: z.string().optional(),
  dingtalk_user_id: z.string().optional(),
});
