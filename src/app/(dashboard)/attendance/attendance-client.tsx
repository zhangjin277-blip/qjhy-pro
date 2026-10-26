"use client";
import AttendanceView from "@/modules/attendance/pro3/ui/AttendanceView";
import { ToastContainer } from "@/modules/attendance/pro3/ui/Toast";
import { ConfirmContainer } from "@/modules/attendance/pro3/ui/ConfirmDialog";
import "@/modules/attendance/pro3/ui/styles.css";
import "@/modules/attendance/pro3/ui/legacy-utilities.css";
type User = { id: unknown; name: string; display_name: string; username: string; role: string; team_id: unknown };
export function AttendanceClient({ user, permissions }: { user: User; permissions: string[] }) {
  return <main className="pro3-attendance p-6 text-slate-800 bg-slate-50 min-h-full">
    <AttendanceView user={user} permissions={permissions} />
    <ToastContainer /><ConfirmContainer />
  </main>;
}
