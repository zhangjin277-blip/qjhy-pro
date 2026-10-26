import {
  APPROVAL_PROCESS_CODES,
  syncApprovalData,
  syncAttendanceData,
} from "@/modules/attendance/pro3/server/dingtalk";
import { dbRun, getDatabase, getToday } from "@/modules/attendance/pro3/server/runtime";

let running = false;

/** 每天北京时间 09:00 同步前一天的考勤和审批，复用手动同步的数据和日志。 */
export async function syncAttendance(): Promise<void> {
  if (running) {
    console.warn("[sync-attendance] 上次同步尚未结束，跳过重复执行");
    return;
  }
  running = true;
  try {
    // getToday 使用北京时间；UTC 仅用于日历减一天，避免宿主机时区影响。
    const date = new Date(`${getToday()}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    const workDate = date.toISOString().slice(0, 10);
    const db = getDatabase();
    const attendanceResult = await syncAttendanceData(db, workDate) as {
      total: number;
      synced: number;
      failed: number;
      skipped: number;
    };
    await dbRun(db, `
      INSERT INTO attendance_sync_log
        (sync_date, total, synced, failed, skipped, triggered_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [workDate, attendanceResult.total, attendanceResult.synced, attendanceResult.failed, attendanceResult.skipped, "cron:09:00"]);
    console.log(`[sync-attendance] ${workDate}: 总人数 ${attendanceResult.total}，同步 ${attendanceResult.synced}，失败 ${attendanceResult.failed}，无记录 ${attendanceResult.skipped}`);

    let attendanceError: Error | null = null;
    if (attendanceResult.total === 0 || attendanceResult.failed > 0) {
      attendanceError = new Error(`考勤同步未完整完成：${workDate}，总人数 ${attendanceResult.total}，失败 ${attendanceResult.failed}`);
    }

    // 审批与考勤使用同一日期窗口，避免考勤接口异常时连带跳过审批更新。
    const approvalResult = await syncApprovalData(db, workDate, workDate, Object.keys(APPROVAL_PROCESS_CODES)) as {
      total: number;
      synced: number;
      failed: number;
      skipped: number;
    };
    await dbRun(db, `
      INSERT INTO attendance_sync_log
        (sync_date, total, synced, failed, skipped, triggered_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [`${workDate}(审批)`, approvalResult.total, approvalResult.synced, approvalResult.failed, approvalResult.skipped, "cron:09:00"]);
    console.log(`[sync-approvals] ${workDate}: 总数 ${approvalResult.total}，同步 ${approvalResult.synced}，失败 ${approvalResult.failed}，跳过 ${approvalResult.skipped}`);
    if (attendanceError) {
      throw attendanceError;
    }
    if (approvalResult.failed > 0) {
      throw new Error(`审批同步未完整完成：${workDate}，总数 ${approvalResult.total}，失败 ${approvalResult.failed}`);
    }
  } finally {
    running = false;
  }
}
