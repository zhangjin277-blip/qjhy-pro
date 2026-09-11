import "server-only";
import { getCurrentDingtalkUser, requireUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
const EMERGENCY_POINTS = new Set([
  "course_edit",
  "course_upload",
  "course_delete",
  "exam_manage",
  "learning_stats",
  "training_manage",
]);
export async function requireCourseViewer() {
  const { userId } = await requireUser();
  const identity = await getCurrentDingtalkUser();
  if (identity.kind === "ok" && identity.isEmergency) {
    return { userId, isEmergency: true, perm: { scope: "all" as const, points: EMERGENCY_POINTS } };
  }
  const perm = await resolvePermission(userId, "courses");
  if (perm.scope === "none") throw new Error("无课程中心访问权限");
  return { userId, isEmergency: false, perm };
}
export async function requireCoursePoint(point: string) {
  const { userId } = await requireUser();
  const identity = await getCurrentDingtalkUser();
  if (identity.kind === "ok" && identity.isEmergency) {
    return { userId, isEmergency: true, perm: { scope: "all" as const, points: EMERGENCY_POINTS } };
  }
  const perm = await resolvePermission(userId, "courses");
  if (!perm.points.has(point)) throw new Error("无课程中心操作权限");
  return { userId, isEmergency: false, perm };
}
