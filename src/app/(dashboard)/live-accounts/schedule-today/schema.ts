import { z } from "zod";

const timeSlot = z.tuple([z.string().regex(/^\d{2}:\d{2}$/), z.string().regex(/^\d{2}:\d{2}$/)]);

export const saveOverrideInputSchema = z.object({
  account_id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dingtalk_user_id: z.string().min(1),
  time_slots: z.array(timeSlot),
  reason: z.string().nullable().optional(),
  is_rest: z.boolean().optional(),
});

export const replaceSegmentInputSchema = saveOverrideInputSchema.extend({
  from_dingtalk_user_id: z.string().min(1),
  from_time_slot: timeSlot,
});

export const resizeSegmentInputSchema = saveOverrideInputSchema.extend({
  from_time_slot: timeSlot,
});

export const scheduleSnapshotInputSchema = z.object({
  account_id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  segments: z.array(
    z.object({
      dingtalk_user_id: z.string().min(1),
      time_slot: timeSlot,
      is_rest: z.boolean(),
      reason: z.string().nullable(),
      source: z.string().optional(),
    }),
  ),
});

export const removeAccountInputSchema = z.object({
  account_id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const segmentIdSchema = z.string().min(1);
export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const clearAllInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  account_ids: z.array(z.string().min(1)).min(1).optional(),
});

export type SaveOverrideInput = z.infer<typeof saveOverrideInputSchema>;
export type ReplaceSegmentInput = z.infer<typeof replaceSegmentInputSchema>;
export type ResizeSegmentInput = z.infer<typeof resizeSegmentInputSchema>;
export type ScheduleSnapshotInput = z.infer<typeof scheduleSnapshotInputSchema>;
