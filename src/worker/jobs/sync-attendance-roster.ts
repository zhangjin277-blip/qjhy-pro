import { getDatabase } from "@/modules/attendance/pro3/server/runtime";
import { syncRoster } from "@/modules/attendance/pro3/server/roster";

export async function syncAttendanceRoster(): Promise<void> {
  const result = await syncRoster(getDatabase());
  console.log(`[sync-attendance-roster] ${result.month}: ${result.people} 人，${result.restDays} 个休息人日`);
}
