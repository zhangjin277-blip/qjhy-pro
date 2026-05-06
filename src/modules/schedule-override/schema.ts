import { z } from "zod";

export const overrideInputSchema = z.object({
  account_id: z.string(), // live_account.id 是 TEXT 不是 UUID
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dingtalk_user_id: z.string(),
  time_slots: z
    .array(z.tuple([z.string().regex(/^\d{2}:\d{2}$/), z.string().regex(/^\d{2}:\d{2}$/)]))
    .min(0),
  reason: z.string().optional(),
});
export type OverrideInput = z.infer<typeof overrideInputSchema>;

export interface OverrideRow {
  id: string;
  account_id: string;
  date: string;
  dingtalk_user_id: string;
  time_slots: [string, string][];
  reason: string | null;
  created_by: string | null;
  created_at: string;
}
