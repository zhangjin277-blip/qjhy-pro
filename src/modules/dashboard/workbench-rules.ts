import { z } from "zod";
import type { AttendanceBrief } from "./workbench-types";

export const attendanceSummarySchema = z.array(
  z.object({
    dingtalk_userid: z.string().nullable().optional(),
    total_days: z.coerce.number(),
    normal_days: z.coerce.number(),
    late_days: z.coerce.number(),
    early_leave_days: z.coerce.number(),
    missing_punch_days: z.coerce.number(),
    absent_days_count: z.coerce.number(),
    verified_days: z.coerce.number(),
  }),
);

// Only a single business day's summary is accepted by the workbench caller.
// Count people once even when they have more than one abnormal punch type.
export function summarizeAttendance(
  rows: z.infer<typeof attendanceSummarySchema>,
): AttendanceBrief {
  const working = rows.filter((row) => row.total_days > 0);
  const pending = working.filter((row) => row.verified_days === 0);
  return {
    recorded: working.length,
    normal: working.filter((row) => row.normal_days > 0).length,
    pending: pending.filter(
      (row) =>
        row.late_days + row.early_leave_days + row.missing_punch_days + row.absent_days_count > 0,
    ).length,
    late: pending.filter((row) => row.late_days > 0).length,
    missing: pending.filter((row) => row.missing_punch_days > 0).length,
    early: pending.filter((row) => row.early_leave_days > 0).length,
    absent: pending.filter((row) => row.absent_days_count > 0).length,
  };
}
