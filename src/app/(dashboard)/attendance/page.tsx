import { attendanceActor } from "@/modules/attendance/pro3/access";
import { AttendanceClient } from "./attendance-client";
export const dynamic = "force-dynamic";
export default async function AttendancePage() {
  try {
    const { user, permissions } = await attendanceActor();
    return <AttendanceClient user={{ id: user.id, name: user.name, display_name: user.display_name, username: user.username, role: user.role, team_id: user.team_id }} permissions={permissions} />;
  } catch (error) {
    const message = error instanceof Error ? error.message : "考勤模块暂时无法加载";
    return <main className="p-6"><div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">{message}</div></main>;
  }
}
