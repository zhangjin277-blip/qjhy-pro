import { z } from "zod";
import type { CalendarDay } from "./workbench-management-types";

export const calendarSourceSchema = z.object({
  records: z.array(
    z.object({
      work_date: z.string(),
      dingtalk_userid: z.string().nullable().optional(),
      on_duty_result: z.string().nullable(),
      off_duty_result: z.string().nullable(),
      on_duty_time: z.string().nullable().optional(),
      off_duty_time: z.string().nullable().optional(),
      remark: z.string().nullable().optional(),
      verified_by: z.union([z.string(), z.number()]).nullable().optional(),
    }),
  ),
  approvals: z.array(
    z.object({
      approval_type: z.string(),
      start_time: z.string(),
      end_time: z.string().nullable(),
      leave_type: z.string().nullable().optional(),
      reason: z.string().nullable().optional(),
    }),
  ),
  roster: z.array(z.object({ work_date: z.string(), status: z.string() })).default([]),
});
export function monthBounds(month: string) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("月份格式应为 YYYY-MM");
  const [y = 2000, m = 1] = month.split("-").map(Number);
  return {
    start: `${month}-01`,
    end: `${month}-${new Date(Date.UTC(y, m, 0)).getUTCDate()}`,
    offset: (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7,
  };
}
export function buildCalendar(
  month: string,
  today: string,
  source: z.infer<typeof calendarSourceSchema>,
): CalendarDay[] {
  const { end } = monthBounds(month);
  const records = new Map(source.records.map((row) => [row.work_date.slice(0, 10), row]));
  const rest = new Set(
    source.roster.filter((row) => row.status === "rest").map((row) => row.work_date.slice(0, 10)),
  );
  return Array.from({ length: Number(end.slice(8)) }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, "0")}`;
    const record = records.get(date);
    const apps = source.approvals.filter(
      (a) => a.start_time.slice(0, 10) <= date && (a.end_time || a.start_time).slice(0, 10) >= date,
    );
    const day: CalendarDay = {
      date,
      status: "none",
      label: String(i + 1),
      on: record?.on_duty_time ?? null,
      off: record?.off_duty_time ?? null,
      remark: record?.remark ?? null,
      approvals: apps.map((a) => ({
        type: a.leave_type || a.approval_type,
        start: a.start_time,
        end: a.end_time,
        reason: a.reason ?? null,
      })),
    };
    const mark = (status: CalendarDay["status"], label: string) =>
      Object.assign(day, { status, label });
    if (rest.has(date)) return mark("rest", "休");
    // Future dates carry no attendance conclusion, including absence.
    if (date > today) return day;
    if (apps.some((a) => a.approval_type === "leave")) return mark("leave", "假");
    if (apps.some((a) => ["go_out", "business_trip"].includes(a.approval_type)))
      return mark("outing", "外");
    if (apps.some((a) => a.approval_type === "repair_check")) return mark("repair", "补");
    if (!record) return day;
    const results = [record.on_duty_result, record.off_duty_result];
    const abnormal = results.some(
      (r) => r && ["NotSigned", "Absenteeism", "Late", "SeriousLate", "Early"].includes(r),
    );
    if (record.verified_by && abnormal) return mark("explained", "说明");
    if (results.includes("Absenteeism")) return mark("absent", "缺勤");
    if (results.includes("NotSigned")) return mark("missing", "缺");
    if (results.some((r) => r === "Late" || r === "SeriousLate")) return mark("late", "迟");
    if (results.includes("Early")) return mark("early", "早");
    if (
      ["Normal", "GraceLate"].includes(record.on_duty_result || "") &&
      record.off_duty_result === "Normal"
    )
      return mark("normal", record.on_duty_result === "GraceLate" ? "迟" : String(i + 1));
    return day;
  });
}
