/* eslint-disable @typescript-eslint/no-explicit-any */
import { legacyCalendarDate } from "../src/lib/business-date";
import { execFileSync } from "node:child_process";
import { db } from "@/db/client";
import {
  attendance_approval,
  attendance_record,
  procurement_item,
  procurement_log,
} from "@/db/schema";

const source = process.env.MIRACLE_DB ?? "/Users/zhangjin/miracle-pro3/server/database.sqlite";
const dryRun = process.argv.includes("--dry-run");
function rows<T>(query: string): T[] {
  const out = execFileSync("sqlite3", ["-json", source, query], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 512,
  }).trim();
  return out ? JSON.parse(out) : [];
}
const q = (v: unknown) => (v === undefined || v === null || v === "" ? null : v);
const json = (v: unknown, fallback: unknown) => {
  if (!v) return fallback;
  try {
    return JSON.parse(String(v));
  } catch {
    return fallback;
  }
};
const dateValue = (v: unknown): Date | null => {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};
const dateText = legacyCalendarDate;

async function main() {
  const procurement = rows<any>("SELECT * FROM procurement_items ORDER BY id");
  const attendance = rows<any>("SELECT * FROM attendance_records ORDER BY work_date, id");
  const approvals = rows<any>("SELECT * FROM approval_instances ORDER BY id");
  console.log(
    `source=${source} procurement=${procurement.length} attendance=${attendance.length} approvals=${approvals.length}`,
  );
  if (dryRun) return;
  for (const x of procurement) {
    const [row] = await db
      .insert(procurement_item)
      .values({
        item_name: x.item_name || "未命名物品",
        price: String(x.price ?? 0),
        quantity: Number(x.quantity ?? 1),
        platform: q(x.platform) as string | null,
        link: q(x.link) as string | null,
        screenshot: q(x.screenshot) as string | null,
        requester: q(x.requester) as string | null,
        room: q(x.room) as string | null,
        anchor_name: q(x.anchor_name) as string | null,
        usage: q(x.usage) as string | null,
        remarks: q(x.remarks) as string | null,
        invoice: q(x.invoice) as string | null,
        status: x.status ?? "pending",
        order_id: q(x.order_id) as string | null,
        tracking_no: q(x.tracking_no) as string | null,
        shop_name: q(x.shop_name) as string | null,
        actual_price: x.actual_price == null ? null : String(x.actual_price),
        return_reason: q(x.return_reason) as string | null,
        refund_amount: String(x.refund_amount ?? 0),
        submitter: q(x.submitter) as string | null,
        submitter_team_id: q(x.submitter_team_id) ? String(x.submitter_team_id) : null,
        approver_name: q(x.approver_name) as string | null,
        approval_remark: q(x.approval_remark) as string | null,
        approval_date: dateText(x.approval_date),
        submission_date: dateText(x.submission_date),
        purchase_date: dateText(x.purchase_date),
        received_date: dateText(x.received_date),
        return_date: dateText(x.return_date),
        created_at: dateValue(x.created_at) ?? undefined,
        updated_at: dateValue(x.updated_at) ?? undefined,
      })
      .returning({ id: procurement_item.id });
    if (row)
      await db
        .insert(procurement_log)
        .values({
          item_id: row.id,
          action: "从 Miracle Pro3 导入",
          to_status: x.status ?? "pending",
          operator: "migration",
        });
  }
  for (const x of attendance) {
    await db
      .insert(attendance_record)
      .values({
        dingtalk_user_id: String(x.dingtalk_userid),
        name: x.name || "未知",
        dept_name: x.dept_name || "",
        work_date: dateText(x.work_date) ?? "1970-01-01",
        on_duty_time: dateValue(x.on_duty_time),
        off_duty_time: dateValue(x.off_duty_time),
        on_duty_result: q(x.on_duty_result) as string | null,
        off_duty_result: q(x.off_duty_result) as string | null,
        on_duty_location: q(x.on_duty_location) as string | null,
        off_duty_location: q(x.off_duty_location) as string | null,
        all_check_times: json(x.all_check_times, []),
        late_minutes: Number(x.late_minutes ?? 0),
        early_leave_minutes: Number(x.early_leave_minutes ?? 0),
        work_duration: q(x.work_duration) as string | null,
        absent_days: String(x.absent_days ?? 0),
        attendance_days: String(x.attendance_days ?? 0),
        rest_days: String(x.rest_days ?? 0),
        remark: q(x.remark) as string | null,
        remark_by: q(x.remark_by) as string | null,
        remark_at: dateValue(x.remark_at),
        verified_by: q(x.verified_by) as string | null,
        verified_at: dateValue(x.verified_at),
        raw_data: json(x.raw_data, null),
        synced_at: dateValue(x.synced_at),
      })
      .onConflictDoNothing();
  }
  for (const x of approvals)
    await db
      .insert(attendance_approval)
      .values({
        instance_id: String(x.instance_id),
        process_code: x.process_code || "",
        approval_type: x.approval_type || "",
        title: q(x.title) as string | null,
        originator_user_id: String(x.originator_userid),
        originator_name: q(x.originator_name) as string | null,
        dept_name: q(x.dept_name) as string | null,
        status: x.status || "",
        result: q(x.result) as string | null,
        start_time: dateValue(x.start_time),
        end_time: dateValue(x.end_time),
        duration_hours: x.duration_hours == null ? null : String(x.duration_hours),
        reason: q(x.reason) as string | null,
        leave_type: q(x.leave_type) as string | null,
        form_data: json(x.form_data, null),
        create_time: dateValue(x.create_time),
        finish_time: dateValue(x.finish_time),
        synced_at: dateValue(x.synced_at),
      })
      .onConflictDoNothing();
  console.log("import complete");
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
